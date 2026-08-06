/**
 * Vercel serverless entrypoint.
 *
 * Unlike ./index.ts (which starts a long-lived HTTP listener), Vercel
 * invokes the Express app directly per-request. The admin seed is NOT
 * run here — the database is shared with the primary (Replit) deployment,
 * which already maintains the admin account.
 */
import app from "./app";

export default app;
