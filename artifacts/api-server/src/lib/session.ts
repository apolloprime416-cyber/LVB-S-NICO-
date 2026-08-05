import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    // set true after admin password step, cleared once code is verified
    pendingAdminUserId?: string;
  }
}

export {};
