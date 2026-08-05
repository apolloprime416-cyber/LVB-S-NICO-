---
name: Orval zod codegen patch
description: Generated api-zod schemas use zod v4 APIs but import from 'zod' (v3) — must patch after every codegen.
---

Orval 8.x generates zod schemas using v4-only APIs (`z.int()`, `z.email()`), but the workspace catalog resolves `zod` to 3.25.x, whose top-level export is Zod 3.

**Why:** `pnpm --filter @workspace/api-spec run codegen` fails its chained typecheck because `lib/api-zod/src/generated/api.ts` starts with `import * as zod from 'zod'`.

**How to apply:** After running orval (run it directly, not via the chained codegen script), patch the import and re-typecheck:

```bash
cd lib/api-spec && npx orval --config ./orval.config.ts
sed -i "s/import \* as zod from 'zod';/import * as zod from 'zod\/v4';/" ../api-zod/src/generated/api.ts
pnpm -w run typecheck:libs
```

Orval `clean: true` wipes the patch on every regen — always re-apply.
