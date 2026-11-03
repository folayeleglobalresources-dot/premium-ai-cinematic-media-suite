# LUMIÈRE — Cinematic Studio

A browser-based cinematic media workspace built with Next.js.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL` to a dedicated PostgreSQL database for LUMIÈRE.
4. Run `npm run db:migrate` to apply the versioned migrations.
5. Start the app with `npm run dev`.

## Production requirements

- **PostgreSQL:** `DATABASE_URL` is required for projects, timelines, assets, looks, broadcasts, settings, and AI session records.
- **Durable media storage:** production uploads must use an object-storage provider. The local `data/` filesystem adapter is suitable only for local development; serverless deployment filesystems are ephemeral and must not be treated as durable storage.
- **AI provider:** `OPENAI_API_KEY` is optional when using the local AI fallback; configure it only if the hosted AI provider is enabled.

The first migration preserves the original project and asset tables as `legacy_projects` and `legacy_assets` before creating the active runtime schema. Those legacy tables are retained rather than dropped.

## Validation

- `npm run typecheck` runs the strict TypeScript check.
- `npm run build` creates the production Next.js build.
- Database migrations are deliberately separate from deployment; apply them only after configuring the LUMIÈRE database.

## Deployment

The app is deployed through the existing Vercel project `lumiere-studio`. Do not connect this project to the ClinicConsilium database or reuse its credentials.
