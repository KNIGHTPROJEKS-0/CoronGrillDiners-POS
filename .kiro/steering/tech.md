# Tech Stack

## Runtime & Framework

- **Next.js 15** (App Router) with **React 19**
- **TypeScript** (strict mode, `@/*` path alias maps to repo root)
- Target: ES6, module resolution: `bundler`

## Database

- **PostgreSQL** via `pg` (node-postgres) — direct pool, no ORM at query time
- **Prisma** is used only for schema introspection/type generation; the generated client outputs to `lib/generated/prisma`
- Two schemas in use: `auth` (Supabase-managed) and `public` (application tables)
- Connection is configured in `lib/db.ts` — supports Supabase pooler URLs, Neon, and Replit's `PG*` env vars automatically
- Always use **parameterized queries** (`$1, $2, …`) — never string-interpolate user input into SQL
- Use `hasColumn()` from `lib/db.ts` before referencing columns that may not exist in all environments (e.g. `is_deleted`, `deleted_at`)

## Authentication

- **NextAuth v4** with `CredentialsProvider` — credentials checked against `public.users` with `bcryptjs`
- Session strategy: **JWT** (30-day expiry)
- Session carries `id`, `username`, `role` on `token` and `session.user`
- Rate limiting on `/api/auth/[...nextauth]` credentials callback via `lib/rate-limit.ts`

## UI

- **Tailwind CSS v3** with CSS variable-based theming (HSL tokens in `globals.css`)
- **shadcn/ui** components live in `components/ui/` — use `cn()` from `lib/utils.ts` for class merging
- **Radix UI** primitives underpin all shadcn components
- **Lucide React** for icons
- **Sonner** for toast notifications
- **Recharts** for analytics charts
- `date-fns` for date math; `react-hook-form` + `zod` for forms

## PWA

- Service worker registered via `app/components/sw-register.tsx`
- `manifest.json` at public root; Apple touch icons explicitly linked in `app/layout.tsx`

## Deployment

- Deployed to **Vercel** (auto-deploy on merge to `main`)
- `@vercel/analytics` and `@vercel/speed-insights` are included in the root layout
- Dev server runs on port **5000** (`next dev -p 5000 -H 0.0.0.0`)

## Common Commands

```bash
# Install dependencies
pnpm install

# Development server (run manually in terminal — do NOT use as a background task)
pnpm dev        # starts on http://localhost:5000

# Production build
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint

# Regenerate Prisma client (also runs automatically on postinstall)
pnpm prisma generate
```

## Environment Variables

Key vars expected at runtime (see `.env` / `.env.local`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (fallback) |
| `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT` | Preferred over `DATABASE_URL` when set |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXTAUTH_URL` | Canonical app URL |
