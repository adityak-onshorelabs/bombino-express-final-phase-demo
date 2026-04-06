import {
  type User, type InsertUser, users,
  type KycDocument, type InsertKycDocument, kycDocuments,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  saveKycDocument(doc: InsertKycDocument): Promise<KycDocument>;
  getKycDocument(id: string): Promise<KycDocument | undefined>;
}

export class DrizzleStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async saveKycDocument(doc: InsertKycDocument): Promise<KycDocument> {
    const [saved] = await db.insert(kycDocuments).values(doc).returning();
    return saved;
  }

  async getKycDocument(id: string): Promise<KycDocument | undefined> {
    const [doc] = await db.select().from(kycDocuments).where(eq(kycDocuments.id, id));
    return doc;
  }
}

export const storage = new DrizzleStorage();
