import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "adm475869@gmail.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin475869";
const ADMIN_CODE = process.env.ADMIN_2FA_CODE ?? "36546697";

export const ADMIN_EMAIL_NORMALIZED = ADMIN_EMAIL;

/** Ensure the fixed admin account exists and matches the configured credentials. */
export async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL));

  if (existing) {
    await db
      .update(usersTable)
      .set({
        passwordHash,
        role: "admin",
        status: "approved",
        twoFactorCode: ADMIN_CODE,
      })
      .where(eq(usersTable.id, existing.id));
    logger.info("Admin account ensured");
    return;
  }

  await db.insert(usersTable).values({
    name: "Administrador",
    email: ADMIN_EMAIL,
    passwordHash,
    role: "admin",
    status: "approved",
    twoFactorCode: ADMIN_CODE,
  });
  logger.info("Admin account created");
}
