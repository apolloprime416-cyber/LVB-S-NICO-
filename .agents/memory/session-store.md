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
