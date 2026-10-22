# Reverse proxy — assets décorrélés du binaire Fleet

Découple le service de fichiers statiques (le bundle JS/CSS du front, ~24 Mo en
build dev non minifié) du binaire Go, **sans modifier aucun fichier existant du
projet Fleet** (`server/`, `cmd/`, `webpack.config.js`, `Dockerfile`,
`docker-compose.prod.yml`). Tout vit dans `infra/`, en plus — même esprit que
`frontend-nuxt/` (#4) : des fichiers séparés, zéro touche à la codebase Fleet.

## Pourquoi

Le bundle JS non minifié pèse ~24 Mo. Servi directement par le binaire Fleet
derrière un tunnel à bande passante limitée (ngrok en dev), il rendait l'UI
injouable. Un hôte statique dédié (nginx) résout ça sans toucher à la manière
dont Fleet build ou sert son frontend aujourd'hui.

**Pourquoi pas une modification de `webpack.config.js`/`server/service/frontend.go`
comme tenté initialement** : ces fichiers sont très actifs côté upstream
(`server/config/config.go` : 202 commits historiques, `webpack.config.js` : 45,
`server/service/frontend.go` : 32) — les modifier crée un risque de conflit à
chaque `git merge upstream/main`. Cette approche évite complètement le problème :
le routage se fait entièrement en dehors du code source.

## Comment ça marche

```
navigateur
    │  une seule origine publique
    ▼
reverse-proxy (nginx, infra/reverse-proxy/)
    │
    ├── /assets/*  ──────────►  assets (nginx, infra/assets-static/)
    │                           sert un build webpack produit à part,
    │                           avec le webpack.config.js INCHANGÉ de Fleet
    │
    └── tout le reste ───────►  fleet (service existant, docker-compose.prod.yml,
                                 INCHANGÉ — API, SPA, MDM, websockets live queries)
```

Le navigateur ne voit qu'une seule origine ; les URLs relatives `/assets/...`
que le HTML de Fleet génère déjà (sans aucune modification) continuent de
fonctionner telles quelles — le reverse-proxy décide juste, en interne, quel
service répond.

## Lancer

```bash
docker compose -f docker-compose.prod.yml -f infra/reverse-proxy/docker-compose.override.yml \
  --env-file .env.prod up -d --build
```

Le reverse-proxy écoute sur `REVERSE_PROXY_PORT` (8080 par défaut, configurable
dans `.env.prod`) — c'est lui le point d'entrée public désormais, pas
`FLEET_SERVER_PORT` directement.

## Et pour changer de stack front plus tard ?

Même mécanisme, pas de nouvelle invention : ajouter le service du nouveau
front (par ex. `frontend-nuxt/`, #4) dans `docker-compose.override.yml`, et un
bloc `location` dans `nginx.conf.template` routant les pages qu'il reprend —
pendant que `fleet` continue de servir le reste. Migration page par page,
cookie de session déjà partagé (voir `frontend-nuxt/README.md`), toujours zéro
ligne touchée dans `server/` ou `frontend/`.
