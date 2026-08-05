---
name: Session store table
description: connect-pg-simple cannot auto-create its table when the api-server is bundled by esbuild.
---

The api-server uses express-session + connect-pg-simple (table `user_sessions`) with the pool from `@workspace/db`.

**Why:** `createTableIfMissing: true` fails at runtime with `ENOENT .../dist/table.sql` because esbuild bundles the code and the store's SQL file is not copied. Sessions then silently fail to persist (login "succeeds" but the next request is unauthenticated).

**How to apply:** Keep `createTableIfMissing: false` and ensure the table exists in every environment (including production on deploy):

```sql
CREATE TABLE IF NOT EXISTS "user_sessions" ("sid" varchar PRIMARY KEY, "sess" json NOT NULL, "expire" timestamp(6) NOT NULL);
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
```

Note: manual creation is only needed in development — Replit's Publish flow diffs dev vs prod schema and applies it to production automatically (never script prod migrations). `payments` table was also created manually in dev.

Related: `drizzle-kit push` cannot run non-interactively here (prompts for the schema-vs-DB table conflict and dies without a TTY), so new tables (e.g. `extension_files`) were also created manually via psql — remember to create them in production too:

```sql
CREATE TABLE IF NOT EXISTS extension_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename text NOT NULL, size integer NOT NULL, data bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
```
