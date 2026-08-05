import { pgTable, uuid, text, timestamp, integer, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Single-row table holding the downloadable extension zip.
 * The admin uploads/replaces it from the panel; approved clients
 * with at least one paid key may download it.
 */
export const extensionFilesTable = pgTable("extension_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ExtensionFileRow = typeof extensionFilesTable.$inferSelect;
