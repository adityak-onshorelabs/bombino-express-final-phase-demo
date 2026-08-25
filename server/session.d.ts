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
  }
}
