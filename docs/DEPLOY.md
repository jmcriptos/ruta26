# Deploy

El sitio se publica con GitHub Actions (workflow `.github/workflows/deploy-pages.yml`)
en cada push a `main`: corre los tests, versiona los assets (pone un hash de
contenido en cada `?v=`) y publica a GitHub Pages. No hay que tocar los `?v=` a mano.

## Prerequisito (una sola vez)
En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Sin esto sigue el "Deploy from branch" viejo y el workflow no publica.

## Rollback
Volver **Settings → Pages → Source: Deploy from branch (main)** → queda como antes.
El workflow nunca escribe en el repo (solo en el artifact de deploy).
