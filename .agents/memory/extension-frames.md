---
name: Extension all_frames pitfalls
description: LVB Sônico Chrome extension — content scripts run in every iframe; UI and toggle handlers must be top-frame-only
---

The extension's manifest uses `all_frames: true` with `<all_urls>`. Any injected UI (edge arrow, overlay/launcher) and any `chrome.runtime.onMessage` toggle handler runs once per frame on lovable.dev (which embeds preview iframes).

**Why:** duplicated arrow buttons appeared and `TS_TOGGLE_OVERLAY` (sent via `tabs.sendMessage`) was handled by every frame, toggling `sidebarCollapsed` multiple times — the panel closed then instantly reopened.

**How to apply:** guard page-UI injection and tab-wide message handlers with `if (window.top !== window) return;` (done in content.js button injection and at the top of overlay.js IIFE). Keep token capture and other passive listeners frame-agnostic. After edits: `node --check` each JS, rebuild zip excluding package.json, and re-upload via `PUT /api/admin/extension` to BOTH dev and prod (prod accepts admin login via curl).
