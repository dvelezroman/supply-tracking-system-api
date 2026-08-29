# VPS deploy — Postgres, ChromaDB, API, Web, RAG

Guía paso a paso para levantar el stack en un VPS. No hay otro runbook de deploy en el repo; este documento es la referencia.

## Orden

```
Chroma healthy → Postgres healthy → migrate → API (OPENAI + CHROMA_URL) → publish/reindex → Mary chat
```

## 1. Requisitos en el VPS

- Docker + Docker Compose plugin
- Node.js 20+ (si la API corre en el host; opcional si usas solo contenedores)
- Dominio / reverse proxy (nginx o Caddy) con TLS
- Archivo `api/.env` de producción (nunca commitear secretos)

## 2. Variables de entorno (`api/.env`)

Copia desde [`.env.example`](../.env.example) y completa:

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

Imágenes actuales en [`docker-compose.yml`](../docker-compose.yml):

| Servicio   | Imagen                    | Puerto host |
|-----------|---------------------------|-------------|
| postgres  | `postgres:16-alpine`      | `5432`      |
| chromadb  | `chromadb/chroma:1.0.0`   | `8000`      |

### Firewall

- **No** publiques `8000` (Chroma) ni `5432` (Postgres) a Internet.
- Solo `80`/`443` del reverse proxy (y SSH).
- Chroma y Postgres deben ser alcanzables solo desde localhost o la red Docker interna.

## 4. Migraciones (y seed opcional)

```bash
cd api
npm ci
npx prisma migrate deploy
```

Primera instalación / datos demo (opcional):

```bash
npm run prisma:seed
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

```bash
cd web
npm ci
npm run build
```

Sirve `web/dist/supply-tracking-web` (o la carpeta que genere el build) con nginx/Caddy.

Asegura que [`environment.prod.ts`](../../web/src/environments/environment.prod.ts) apunte a la URL pública de la API (`apiBase`).

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

- [ ] `docker compose ps` → postgres + chromadb healthy  
- [ ] `prisma migrate deploy` sin errores  
- [ ] `GET /api/v0/health` → 200  
- [ ] `GET /api/v0/public/recipes` → lista  
- [ ] Login admin + `/recipes/list`  
- [ ] Publish/reindex con OpenAI (sin WARN “OPENAI_API_KEY missing” en logs)  
- [ ] `POST /api/v0/public/chat` → `ragEnabled: true` y `recipeRefs`  
- [ ] Web producción carga tienda / recetas / Mary  
- [ ] Puertos 5432 y 8000 no abiertos al mundo  

## 9. Troubleshooting rápido

| Síntoma | Qué mirar |
|---------|-----------|
| API no arranca en prod | `JWT_SECRET`, `DATABASE_URL`, `NODE_ENV=production` |
| `Can't reach database` | host en `DATABASE_URL` (`postgres` vs `127.0.0.1`), compose up |
| Chroma “not ready” / KeyError | imagen `chromadb/chroma:1.0.0`+ (cliente JS 3.x); `CHROMA_URL` |
| Chat sin RAG | `OPENAI_API_KEY`; reindex; colección `marea_recipe_chunks` |
| CORS | `FRONTEND_URL` / `CORS_ORIGIN` = origen exacto del front |
| Volumen Postgres “role does not exist” | volumen viejo con otro user → recrear volumen solo si es aceptable perder datos |

## Referencias

- Compose: [`api/docker-compose.yml`](../docker-compose.yml)
- Env ejemplo: [`api/.env.example`](../.env.example)
- Notas cortas: [`api/README.md`](../README.md) (sección Production notes)
