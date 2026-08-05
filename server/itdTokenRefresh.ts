import type { NextFunction, Request, Response } from "express";
import {
  findItdUserIdByCustomerId,
  getItdUserTokenAndSecretsById,
  updateItdUserTokenById,
} from "./appDb.js";
import { decryptPassword } from "./crypto.js";
import { itdClient, type ITDUserInfo } from "./itd.js";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
/**
 * Assumed ITD token lifetime.
 *
 * ITD's auth response carries no expiry field (docs/api-spec.md §Auth API), so
 * this is a guess — and the company token in itd.ts assumes 4h for the same
 * endpoint. Confirm the real TTL with ITD; if it is shorter than this, tokens
 * die before the refresh threshold below ever fires.
 */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ITD_LOGIN_TIMEOUT_MS = 10_000;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export function itdTokenExpiryIso(from: number = Date.now()): string {
  return new Date(from + TWENTY_FOUR_HOURS_MS).toISOString();
}

/**
 * Re-authenticate to ITD as `email` using the stored encrypted password, and
 * put the resulting token on the session.
 *
 * ITD exposes no refresh-token endpoint, so replaying the password is the only
 * way to obtain a token after the initial login — which is what makes
 * phone-only sign-in possible at all: the password captured once at link time
 * stands in for the credential the customer no longer types.
 *
 * Does NOT call req.session.save() — callers that are also writing `user` and
 * `dbUserId` should save once, with everything set.
 *
 * Returns ITD's own view of the user so callers can seat the authoritative
 * identity on the session. That matters because `itd_users` does not persist
 * every ITD identifier: the `code` field ITD returns (the one tracking sends as
 * `customer_code`) has no column, and `itd_customer_code` holds ITD's
 * `customer_id` instead. Rebuilding a session from the stored row alone
 * therefore yields the wrong `code` and queries the wrong customer's tracking.
 *
 * Returns null (never throws) when no token could be minted. That is the
 * expected outcome for local accounts and agents, which have no ITD credential
 * at all; those sessions are valid, just not ITD-backed.
 */
export async function mintItdSession(
  req: Request,
  dbUserId: string,
  email: string
): Promise<ITDUserInfo | null> {
  if (!email) return null;

  try {
    const row = await getItdUserTokenAndSecretsById(dbUserId);
    if (!row?.itd_password_encrypted || !row.encryption_iv) {
      return null;
    }

    let plainPassword: string;
    try {
      plainPassword = decryptPassword(row.itd_password_encrypted, row.encryption_iv);
    } catch (err) {
      console.error("[mintItdSession] decrypt failed:", err);
      return null;
    }

    const { token, user } = await withTimeout(
      itdClient.loginUser(email, plainPassword),
      ITD_LOGIN_TIMEOUT_MS,
      "ITD loginUser (mint)"
    );

    await updateItdUserTokenById(dbUserId, token, itdTokenExpiryIso());
    req.session.itdToken = token;
    return user;
  } catch (err) {
    console.error("[mintItdSession] failed:", err);
    return null;
  }
}

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

    const minted = await mintItdSession(req, dbUserId, req.session.user.email);
    if (!minted) {
      next();
      return;
    }

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
