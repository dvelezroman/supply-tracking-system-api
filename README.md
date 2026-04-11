# Supply Tracking API

NestJS REST API for supply-chain traceability: products, production lots, actors, traceability events, JWT auth, public QR trace payloads, and QR/PDF generation.

## Prerequisites

- Node.js 20+ (recommended)
- PostgreSQL 14+
- npm

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables and edit values (especially `DATABASE_URL` and `JWT_SECRET`):

   ```bash
   cp .env.example .env
   ```

3. Generate the Prisma client and apply migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. (Optional) Load demo data. The seed is idempotent and uses upserts only (no deletes):

   ```bash
   npm run prisma:seed
   ```

   Default admin user (if created by seed): `admin@supply.com` / `admin123` — change the password in production.

## Environment variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `PORT` | HTTP port (default `3000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (required in production; must not be the dev placeholder) |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`) |
| `FRONTEND_URL` | Base URL of the Angular app (used for public trace links and QR targets; also used for CORS in production if `CORS_ORIGIN` is unset) |
| `CORS_ORIGIN` | Optional comma-separated allowed origins |
| `API_PREFIX` | URL prefix segment (default `api`) |
| `API_VERSION` | URL version segment (default `v0`) |

The HTTP base path is `/{API_PREFIX}/{API_VERSION}` (default `api/v0`).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Run API with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled app (`node dist/main`) |
| `npm run prisma:generate` | Regenerate Prisma Client after schema changes |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run prisma:seed` | Run `prisma/seed.ts` |
| `npm run db:reset` | Reset database and re-run migrations (destructive) |
| `npm run test` | Jest unit tests |
| `npm run lint` | ESLint |

## API documentation

With the server running on port 3000 and default prefix/version:

- Swagger UI: `http://localhost:3000/api/v0/docs`

Authenticate in Swagger using the Bearer token from `POST /api/v0/auth/login`.

## Response shape

Successful JSON responses follow a common envelope:

```json
{
  "success": true,
  "data": { },
  "timestamp": "2026-04-10T12:00:00.000Z"
}
```

Errors are handled by the global exception filter (status code and message in the body).

## Project layout

- `src/` — Nest modules (auth, users, actors, products, lots, traceability, public trace, etc.)
- `prisma/schema.prisma` — database schema
- `prisma/migrations/` — SQL migrations
- `prisma/seed.ts` — seed script

## Production notes

- `assertProductionEnv` in `main.ts` requires a non-default `JWT_SECRET` and `DATABASE_URL`.
- Set `CORS_ORIGIN` or `FRONTEND_URL` so CORS allows your deployed frontend origin.
- Run migrations against the production database before starting the app (`prisma migrate deploy` in CI or on the host).
