import type { NextFunction, Request, Response } from "express";
import redisClient from "./redisClient.js";

const LOGGED_IN_LIMIT = 20;
const GUEST_LIMIT = 10;
const WINDOW_SECONDS = 3600; // 1 hour

export async function supportChatRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // A never-connected node-redis client queues commands instead of rejecting, so
  // awaiting one would hang the request forever and the catch below would never run.
  if (!redisClient.isReady) {
    next();
    return;
  }

  try {
    const dbUserId = req.session.dbUserId;
    const isLoggedIn = !!dbUserId;

    const key = isLoggedIn
      ? `ratelimit:support:${dbUserId}`
      : `ratelimit:support:ip:${
          req.ip || req.socket.remoteAddress || "unknown"
        }`;

    const limit = isLoggedIn ? LOGGED_IN_LIMIT : GUEST_LIMIT;

    const count = await redisClient.incr(key);

    if (count === 1) {
      await redisClient.expire(key, WINDOW_SECONDS);
    }

    if (count > limit) {
      res.status(200).json({
        message:
          "I've reached my message limit " +
          "for now. You can continue our " +
          "conversation in about an hour, " +
          "or contact our team directly " +
          "for immediate help." +
          "\nTAP_CONTACT_US",
        sessionId: null,
        rateLimited: true,
      });
      return;
    }

    next();
  } catch (err) {
    console.warn(
      "[supportRateLimit] Redis unavailable, skipping rate limit check:",
      err
    );
    next();
  }
}
