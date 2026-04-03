import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const kycDocuments = pgTable("kyc_documents", {
  id:               varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentType:     text("document_type").notNull(),
  documentNo:       text("document_no").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType:         text("mime_type").notNull(),
  fileSizeBytes:    integer("file_size_bytes").notNull(),
  fileData:         text("file_data").notNull(),
  createdAt:        text("created_at").notNull().default(sql`now()`),
});

export const insertKycDocumentSchema = createInsertSchema(kycDocuments).omit({ id: true, createdAt: true });
export type InsertKycDocument = z.infer<typeof insertKycDocumentSchema>;
export type KycDocument = typeof kycDocuments.$inferSelect;
