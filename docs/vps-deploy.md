# VPS deploy — Postgres, ChromaDB, API, Web, RAG

Guía paso a paso para levantar el stack en un VPS. No hay otro runbook de deploy en el repo; este documento es la referencia.

## Orden

```
Chroma healthy → Postgres healthy → migrate → API (OPENAI + CHROMA_URL) → publish/reindex → Mary chat
```

## 1. Requisitos en el VPS

- Docker + Docker Compose plugin
- Node.js 22+ (requerido por `openai@7`; si la API corre en el host; opcional si usas solo contenedores)
- Dominio / reverse proxy (nginx o Caddy) con TLS
- Archivo `api/.env` de producción (nunca commitear secretos)

## 2. Variables de entorno (`api/.env`)

Copia desde `[.env.example](../.env.example)` y completa:

```bash
NODE_ENV=production
PORT=3000

# Orígenes públicos (CORS + QR / branding)
FRONTEND_URL=https://tu-dominio.com
CORS_ORIGIN=https://tu-dominio.com

# Postgres
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=supply_tracking

# Si API está en la misma red Docker que el servicio `postgres`:
DATABASE_URL=postgresql://USER:PASS@postgres:5432/supply_tracking?schema=public
# Si API corre en el host y Postgres publica 5432:
# DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/supply_tracking?schema=public

JWT_SECRET=cambia-esto-por-un-secreto-largo
JWT_EXPIRES_IN=7d

# ChromaDB (vectores RAG de recetas)
# Misma red Docker que el servicio `chromadb`:
CHROMA_URL=http://chromadb:8000
# API en host:
# CHROMA_URL=http://127.0.0.1:8000
CHROMA_COLLECTION=marea_recipe_chunks

# OpenAI (Mary RAG — embeddings + chat)
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
```

Opcionales: SMTP, S3, branding (`LABEL_*`), etc. Ver `.env.example`.

### S3 — fotos del marketplace

Misma convención que ruta593: el nombre del bucket de AWS **no puede incluir `/`**. Usa:

```bash
AWS_S3_BUCKET_NAME=bitflow-production-files/mareaalta-marketplace
S3_REGION=us-east-1
# Vacío = tienda/admin cargan vía GET /api/v0/marketplace/media/:id (API hace GetObject)
S3_PUBLIC_BASE_URL=
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

- Objetos: `mareaalta-marketplace/{sku}/{imageId}.jpg` (SKU del producto marketplace).
- IAM mínimo: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sobre el prefijo.
- Si `S3_PUBLIC_BASE_URL` está vacío, URLs directas a S3 fallan (403 en bucket privado); el front usa el proxy de media.
- En producción, sin `AWS_S3_BUCKET_NAME` el upload de imágenes responde 503 (sin fallback local).
- Nunca committear claves IAM.

**Producción:** `main.ts` exige `JWT_SECRET` no-default y `DATABASE_URL` válido.

## 3. Contenedores (Postgres + Chroma)

Desde el directorio `api/`:

```bash
cd api
docker compose up -d
docker compose ps
```

Comprueba salud:

```bash
# Postgres
docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Chroma (API v2)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/api/v2/heartbeat
# esperado: 200
```

Solo Chroma (si Postgres ya existe fuera de compose):

```bash
docker compose up -d chromadb
```

Imágenes actuales en `[docker-compose.yml](../docker-compose.yml)`:


| Servicio | Imagen                  | Puerto host |
| -------- | ----------------------- | ----------- |
| postgres | `postgres:16-alpine`    | `5432`      |
| chromadb | `chromadb/chroma:1.0.0` | `8000`      |




### Firewall

- **No** publiques `8000` (Chroma) ni `5432` (Postgres) a Internet.
- Solo `80`/`443` del reverse proxy (y SSH).
- Chroma y Postgres deben ser alcanzables solo desde localhost o la red Docker interna.



## 4. Migraciones (y seed opcional)

```bash
cd api
npm ci
npm run db:migrate:prod
# equivalente: ./scripts/migrate-prod.sh
# (prisma generate + prisma migrate deploy)
```

Primera instalación / datos demo (opcional):

```bash
npm run prisma:seed
```

Solo migraciones (sin regenerate):

```bash
npm run prisma:migrate:prod
```

El seed incluye ~19 recetas de camarón en estado `PUBLISHED` (aún sin embeddings hasta reindex con OpenAI).

## 5. API NestJS

```bash
cd api
npm ci
npm run build
NODE_ENV=production node dist/src/main.js
```

Alternativas: `pm2`, systemd, o imagen Docker propia.

Smoke:

```bash
curl -s https://api.tu-dominio.com/api/v0/health
# o, en el host:
curl -s http://127.0.0.1:3000/api/v0/health
```

Swagger (si lo dejas expuesto solo en red privada): `http://127.0.0.1:3000/api/v0/docs`

### Proxy

El reverse proxy debe reenviar al puerto de la API (`3000` por defecto), p.ej. `https://api.tu-dominio.com` → `http://127.0.0.1:3000`.

## 6. Web (Angular)

Monorepo (`api/` + `web/` en el mismo clone):

```bash
cd /var/www/supply-tracking-system/web
npm ci   # incluye devDependencies (@angular/cli); no uses --omit=dev
npm run build
```

Desde la raíz del monorepo (con el `package.json` wrapper del repo):

```bash
cd /var/www/supply-tracking-system
npm run install:web   # o: npm ci --prefix web
npm run build         # delega a web/
```

Si el `package.json` de Angular está **en la raíz** del VPS (solo desplegaste `web/` ahí):

```bash
cd /var/www/supply-tracking-system
npm ci
npm run build
```

Errores típicos:

| Mensaje | Causa | Fix |
|--------|--------|-----|
| `ng: not found` | Sin `node_modules/.bin` | `npm ci` en la carpeta del `package.json` web |
| `Cannot find module .../@angular/cli/bin/ng.js` / `[@angular/cli missing]` | Sin deps o **`npm config production=true`** (omite devDeps) | `npm ci --include=dev` en carpeta del `package.json` web; `npm config set production false` |
| Build desde raíz monorepo sin wrapper | `package.json` está en `web/` | `cd web` o `npm run build --prefix web` |

Sirve `web/dist/supply-tracking-web` (o la carpeta que genere el build) con nginx/Caddy.

Asegura que `[environment.prod.ts](../../web/src/environments/environment.prod.ts)` apunte a la URL pública de la API (`apiBase`).

## 7. Activar RAG (recetas + Mary)

Con `OPENAI_API_KEY` y Chroma ya arriba:

1. Entra al panel admin (`ADMIN`) → **Recetas / RAG** (`/recipes/list`).
2. Publica recetas (o **Importar API** / URL → `PENDING_REVIEW` → revisar → **Publicar**).
3. En cada publicada: **Reindexar en Chroma** (icono psychology), o confía en el index automático al publicar.
4. Prueba Mary en la landing (pregunta libre, p.ej. “ceviche de camarón”).
5. Endpoints útiles:
  - `GET /api/v0/public/recipes?q=ceviche`
  - `POST /api/v0/public/chat` body `{ "message": "..." }`
  - Admin: `POST /api/v0/recipes/admin/:id/reindex` (Bearer JWT)

Sin `OPENAI_API_KEY`, search/likes/admin funcionan; el chat responde fallback y el embed se omite.

## 8. Checklist post-deploy

- [x] `docker compose ps` → postgres + chromadb healthy  
- [x] `npm run db:migrate:prod` (o `./scripts/migrate-prod.sh`) sin errores  
- [x] `GET /api/v0/health` → 200  
- [x] `GET /api/v0/public/recipes` → lista  
- [x] Login admin + `/recipes/list`  
- [x] Publish/reindex con OpenAI (sin WARN “OPENAI_API_KEY missing” en logs)  
- [ ] `POST /api/v0/public/chat` → `ragEnabled: true` y `recipeRefs`  
- [ ] Web producción carga tienda / recetas / Mary  
- [ ] Puertos 5432 y 8000 no abiertos al mundo  



## 9. Troubleshooting rápido


| Síntoma                                | Qué mirar                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| API no arranca en prod                 | `JWT_SECRET`, `DATABASE_URL`, `NODE_ENV=production`                             |
| `Can't reach database`                 | host en `DATABASE_URL` (`postgres` vs `127.0.0.1`), compose up                  |
| Chroma “not ready” / KeyError          | imagen `chromadb/chroma:1.0.0`+ (cliente JS 3.x); `CHROMA_URL`                  |
| Chat sin RAG                           | `OPENAI_API_KEY`; reindex; colección `marea_recipe_chunks`                      |
| CORS en upload (DevTools, sin ACAO)    | Suele ser **nginx 413/504**, no Nest: ver § nginx abajo (`client_max_body_size`) |
| CORS                                   | `FRONTEND_URL` / `CORS_ORIGIN` = origen exacto del front (+ www si aplica)      |
| Volumen Postgres “role does not exist” | volumen viejo con otro user → recrear volumen solo si es aceptable perder datos |




## 10. nginx — API (`api.marea-alta.ec`)

El marketplace permite fotos hasta **512 KB** (`PRODUCT_IMAGE_MAX_BYTES`; el admin web comprime antes de subir). nginx por defecto limita el body a **1 MB** — con 512 KB en API suele bastar; si subís por otra vía, ver `client_max_body_size`.

Dentro del `server` / `location` que hace `proxy_pass` a la API:

```nginx
# Marketplace image upload (max 512 KB in API)
client_max_body_size 1m;

proxy_connect_timeout 60s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Tras `sudo nginx -t && sudo systemctl reload nginx`, un POST >1 MB debe llegar a Nest (401/503 con JSON y CORS si falta token o S3).

Comprobar desde fuera (sin JWT, solo tamaño):

```bash
# ~2 MB — antes 413; tras el cambio 401 con Access-Control-Allow-Origin
dd if=/dev/zero bs=1024 count=2048 2>/dev/null | curl -sS -D - -o /dev/null -X POST \
  'https://api.marea-alta.ec/api/v0/marketplace/admin/products/UUID/images' \
  -H 'Origin: https://www.marea-alta.ec' -F 'file=@-;filename=test.jpg'
```

## Referencias

- Compose: `[api/docker-compose.yml](../docker-compose.yml)`
- Env ejemplo: `[api/.env.example](../.env.example)`
- Notas cortas: `[api/README.md](../README.md)` (sección Production notes)

