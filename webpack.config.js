require("es6-promise").polyfill();

const path = require("path");
const webpack = require("webpack");
const bourbon = require("node-bourbon").includePaths;
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const WebpackNotifierPlugin = require("webpack-notifier");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const globImporter = require("node-sass-glob-importer");

const DEV_SOURCE_MAPS = "eval-source-map";

// Emits assets/manifest.json ({"main.js": "bundle-<hash>.js", "main.css":
// "bundle-<hash>.css"}) instead of a server-rendered HTML file. The backend
// (server/service/frontend.go) owns its own small index.html template and
// reads this manifest to find the current bundle filenames -- so it no
// longer needs to understand anything webpack- or React-specific. Swapping
// the frontend's build tool later only requires that tool to also emit this
// same two-key manifest shape; the Go side never has to change.
class FleetAssetManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap("FleetAssetManifestPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "FleetAssetManifestPlugin",
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const manifest = {};
          for (const chunk of compilation.chunks) {
            for (const file of chunk.files) {
              if (file.endsWith(".js") && !manifest["main.js"]) {
                manifest["main.js"] = file;
              }
              if (file.endsWith(".css") && !manifest["main.css"]) {
                manifest["main.css"] = file;
              }
            }
          }
          const json = JSON.stringify(manifest, null, 2);
          compilation.emitAsset("manifest.json", new webpack.sources.RawSource(json));
        }
      );
    });
  }
}

let plugins = [
  new ForkTsCheckerWebpackPlugin(),
  new FleetAssetManifestPlugin(),
  new WebpackNotifierPlugin({
    excludeWarnings: true,
  }),
  new webpack.DefinePlugin({
    featureFlags: {},
  }),
];

if (process.env.NODE_ENV === "production") {
  plugins = plugins.concat([
    new webpack.DefinePlugin({
      "process.env": { NODE_ENV: JSON.stringify("production") },
    }),
    new MiniCssExtractPlugin({
      filename: "bundle-[contenthash].css",
    }),
  ]);
} else {
  // development
  plugins = plugins.concat([
    new MiniCssExtractPlugin({ filename: "bundle.css" }),
  ]);
}

const repo = __dirname;

const config = {
  mode: process.env.NODE_ENV,
  entry: {
    bundle: path.join(repo, "frontend/index.jsx"),
  },
  output: {
    path: path.join(repo, "assets/"),
    // ASSETS_BASE_URL lets the built bundle (JS/CSS/images) be fetched from
    // a separate static host/CDN instead of this same Fleet server, e.g.
    // ASSETS_BASE_URL=https://assets.example.com/assets/ yarn run webpack.
    // Defaults to the existing same-origin relative path when unset, so
    // builds without it behave exactly as before.
    publicPath: process.env.ASSETS_BASE_URL || "/assets/",
    filename: "[name].js",
  },
  devtool: process.env.NODE_ENV === "development" ? DEV_SOURCE_MAPS : false,
  plugins,
  optimization: {
    minimize: process.env.NODE_ENV === "production",
  },
  module: {
    // The following noParse suppresses the warning about sqlite-parser being a
    // pre-compiled JS file. See https://goo.gl/N4s6bB.
    noParse: /node_modules\/sqlite-parser\/dist\/sqlite-parser-min.js/,
    rules: [
      {
        test: /\.(pdf|png|gif|ico|jpg|svg|eot|otf|woff|woff2|ttf|mp4|webm)$/,
        type: "asset",
        generator: {
          filename: "[name]@[hash][ext]",
        },
      },
      {
        test: /\.(sh|ps1)$/,
        type: "asset/source",
      },
      {
        test: /(\.tsx?|\.jsx?)$/,
        exclude: /node_modules/,
        use: {
          loader: "esbuild-loader",
          options: {
            target: "es2016",
          },
        },
      },
      {
        test: /\.scss$/,
        exclude: /node_modules/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: "./",
            },
          },
          { loader: "css-loader" },
          { loader: "postcss-loader" },
          {
            loader: "sass-loader",
            options: {
              sourceMap: true,
              sassOptions: {
                includePaths: bourbon,
                importer: globImporter(),
                silenceDeprecations: [
                  "import",
                  "global-builtin",
                  "slash-div",
                  "color-functions",
                  "mixed-decls",
                  "legacy-js-api",
                ],
              },
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {},
          },
          "css-loader",
          "postcss-loader",
        ],
      },
      {
        test: /\.jsx?$/,
        include: path.join(repo, "frontend"),
        use: { loader: "babel-loader", options: { cacheDirectory: true } },
      },
    ],
  },
  performance: {
    hints: false,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx", ".json"],
    modules: [path.resolve(path.join(repo, "./frontend")), "node_modules"],
    fallback: { path: require.resolve("path-browserify") },
    alias: {
      "node-sql-parser": path.resolve(
        __dirname,
        "node_modules/@sgress454/node-sql-parser/umd/sqlite.umd.js"
      ),
    },
  },
};

if (process.env.NODE_ENV === "production") {
  config.output.filename = "[name]-[contenthash].js";
}

module.exports = config;
