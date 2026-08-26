/**
 * Express-session type augmentation for Bombino auth.
 * Extends session so req.session.user and req.session.itdToken are typed.
 * No runtime behavior.
 */

import type s from "express-session";
import type { ITDUserInfo } from "./itd";

declare global {
  namespace Express {
    interface Request {
      session: s.Session & Partial<s.SessionData> & {
        user?: ITDUserInfo;
        itdToken?: string;
        dbUserId?: string;
        signupRef?: string;
        digilocker?: DigiLockerSession;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    user?: ITDUserInfo;
    itdToken?: string;
    dbUserId?: string;
    /**
     * Owner of the documents uploaded during an in-flight signup, before an
     * account exists to own them. Minted on the first upload, cleared once
     * the account claims the rows. See migrations/add_account_categories_and_documents.sql.
     */
    signupRef?: string;
    /**
     * The live DigiLocker journey, between creating the consent URL and
     * reading the Aadhaar back. Session-scoped rather than stored, because it
     * is worth nothing once consumed and must not outlive the browser that
     * started it. See server/cashfreeIdentity.ts.
     */
    digilocker?: DigiLockerSession;
  }
}

/**
 * One in-flight DigiLocker consent journey.
 *
 * `verificationId` is ours — we mint it, Cashfree echoes it, and every poll
 * quotes it. Holding it here rather than accepting it from the client is what
 * stops one browser polling another signup's journey to completion.
 */
export interface DigiLockerSession {
  verificationId: string;
  /** Epoch ms. Expiry is ours, deliberately inside Cashfree's ten minutes. */
  createdAt: number;
  /** How many journeys this session has started. Each is a billed call. */
  started: number;
}
