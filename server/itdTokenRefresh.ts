import type { NextFunction, Request, Response } from "express";
import {
  findItdUserIdByCustomerId,
  getItdUserTokenAndSecretsById,
  updateItdUserTokenById,
} from "./appDb.js";
import { decryptPassword } from "./crypto.js";
import { itdClient } from "./itd.js";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * For logged-in users only: refresh ITD token in session + Supabase when expiry is within 2 hours or unknown.
 * Always calls next(); failures are logged and do not block the request.
 */
export async function refreshItdTokenIfNeeded(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.session.user) {
    next();
    return;
  }

  let dbUserId = req.session.dbUserId;
  if (!dbUserId) {
    try {
      const row = await findItdUserIdByCustomerId(req.session.user.id);
      if (row?.id) {
        req.session.dbUserId = row.id;
        dbUserId = row.id;
      }
    } catch (err) {
      console.error("[refreshItdTokenIfNeeded] findItdUserId failed:", err);
      next();
      return;
    }
  }

  if (!dbUserId) {
    next();
    return;
  }

  try {
    const row = await getItdUserTokenAndSecretsById(dbUserId);
    if (!row) {
      next();
      return;
    }

    const expiryMs = row.itd_token_expires_at
      ? new Date(row.itd_token_expires_at).getTime()
      : NaN;
    const needsRefresh =
      !Number.isFinite(expiryMs) || Date.now() >= expiryMs - TWO_HOURS_MS;

    if (!needsRefresh) {
      next();
      return;
    }

    if (!row.itd_password_encrypted || !row.encryption_iv) {
      next();
      return;
    }

    let plainPassword: string;
    try {
      plainPassword = decryptPassword(row.itd_password_encrypted, row.encryption_iv);
    } catch (err) {
      console.error("[refreshItdTokenIfNeeded] decrypt failed:", err);
      next();
      return;
    }

    const { token } = await itdClient.loginUser(req.session.user.email, plainPassword);
    const expiresAtIso = new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString();
    await updateItdUserTokenById(dbUserId, token, expiresAtIso);

    req.session.itdToken = token;
    req.session.save((err) => {
      if (err) {
        console.error("[refreshItdTokenIfNeeded] session save error:", err);
      }
      next();
    });
  } catch (err) {
    console.error("[refreshItdTokenIfNeeded] failed:", err);
    next();
  }
}
