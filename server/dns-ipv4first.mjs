/**
 * Preload: run with `node --import ./server/dns-ipv4first.mjs` (see package.json NODE_OPTIONS).
 * Ensures IPv4 is preferred before any app modules (and pg pools) load.
 */
import { setDefaultResultOrder } from "node:dns";

if (typeof setDefaultResultOrder === "function") {
  setDefaultResultOrder("ipv4first");
}
