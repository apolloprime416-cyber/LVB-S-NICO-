---
name: Lovable watermark removal
description: How the extension's "remover marca d'água" works and its fragile points
---

The feature edits the project's global CSS directly via Lovable's `/edit-code` endpoint (no AI credits). Duplicate implementations live in BOTH `sidepanel.js` and `content.js` — any fix must be applied to both, plus `background.js` (`downloadProject`).

**Why:** a client-reported failure traced to four fragilities: (1) badge-hidden regex matched `display:none` anywhere after `#lovable-badge`, causing false "already removed"; (2) only six hard-coded CSS paths accepted; (3) success required status exactly 200; (4) source download used only one API domain (`lovable-api.com`; `api.lovable.dev` also exists).

**How to apply:** keep the regex block-scoped (`#lovable-badge[^{}]*\{[^}]*display:none`), accept any 2xx, try both API domains, and NEVER fall back to an arbitrary .css — only a positively identified global stylesheet (tailwind/`:root`), otherwise fail with a clear error.
