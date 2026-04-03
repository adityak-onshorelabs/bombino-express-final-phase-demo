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
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    user?: ITDUserInfo;
    itdToken?: string;
  }
}
