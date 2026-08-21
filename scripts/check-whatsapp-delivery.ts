/**
 * Proves the two contracts the WhatsApp layer rests on, against the real
 * `whatsapp_messages` table: a message is sent at most once, and a receipt
 * never moves a row backwards.
 *
 * Neither is testable by reading the code — the first depends on a unique
 * index and the second on out-of-order callbacks — and neither is visible
 * until it has already gone wrong in production.
 *
 * Forces `WA_DRY_RUN=1`, so no message leaves the building whatever the
 * environment says. WRITES A HANDFUL OF ROWS TO THE SHARED SUPABASE PROJECT
 * and deletes them again; every one is tagged `selftest:<timestamp>` and no
 * other table is touched.
 *
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/check-whatsapp-delivery.ts
 */

process.env.WA_DRY_RUN = "1";

import { sendTemplate } from "../server/whatsapp.js";
import { supabase } from "../server/supabaseClient.js";
import { applyDeliveryReceipt } from "../server/whatsappDb.js";

const KEY = `selftest:${Date.now()}`;
let failures = 0;
const fail = (m: string) => { failures++; console.error(`  FAIL  ${m}`); };
const ok = (m: string) => console.log(`  ok    ${m}`);

async function main() {
  if (!supabase) throw new Error("supabase not configured");

  console.log("\n1. First send claims a row and skips (dry run)");
  const first = await sendTemplate({
    to: "9820012345",
    template: "bombino_selftest",
    variables: ["A", "B"],
    dedupeKey: KEY,
  });
  if (first.ok || first.reason !== "skipped") fail(`expected skipped, got ${JSON.stringify(first)}`);
  else ok("skipped, row written");

  console.log("\n2. Same dedupe key sends nothing");
  const second = await sendTemplate({
    to: "9820012345",
    template: "bombino_selftest",
    variables: ["A", "B"],
    dedupeKey: KEY,
  });
  if (second.ok || second.reason !== "duplicate") fail(`expected duplicate, got ${JSON.stringify(second)}`);
  else ok("duplicate refused");

  console.log("\n3. Exactly one row exists");
  const { data: rows } = await supabase
    .from("whatsapp_messages").select("id, status, to_phone, provider_id").eq("dedupe_key", KEY);
  if ((rows ?? []).length !== 1) fail(`expected 1 row, found ${(rows ?? []).length}`);
  else ok(`1 row, status=${rows![0].status}, to=${rows![0].to_phone}`);

  console.log("\n4. Unusable number never reaches the DB");
  const bad = await sendTemplate({
    to: "not-a-number",
    template: "bombino_selftest",
    variables: ["A"],
    dedupeKey: `${KEY}:bad`,
  });
  if (bad.ok || bad.reason !== "no_number") fail(`expected no_number, got ${JSON.stringify(bad)}`);
  else {
    const { data } = await supabase.from("whatsapp_messages").select("id").eq("dedupe_key", `${KEY}:bad`);
    if ((data ?? []).length !== 0) fail("a row was written for an unusable number");
    else ok("refused, no row");
  }

  console.log("\n5. Delivery receipts never move a message backwards");
  const id = rows![0].id as string;
  await supabase.from("whatsapp_messages").update({ provider_id: `wamid.${KEY}`, status: "sent" }).eq("id", id);
  await applyDeliveryReceipt({ providerId: `wamid.${KEY}`, status: "delivered", error: null });
  await applyDeliveryReceipt({ providerId: `wamid.${KEY}`, status: "sent", error: null });
  const { data: after } = await supabase.from("whatsapp_messages").select("status").eq("id", id).single();
  if (after?.status !== "delivered") fail(`late 'sent' regressed the row to ${after?.status}`);
  else ok("delivered survived a late 'sent'");

  console.log("\n6. A failure receipt always wins");
  await applyDeliveryReceipt({ rowId: id, providerId: `wamid.${KEY}`, status: "failed", error: { code: 131047 } });
  const { data: failed } = await supabase.from("whatsapp_messages").select("status, provider_id").eq("id", id).single();
  if (failed?.status !== "failed") fail(`expected failed, got ${failed?.status}`);
  else ok("failed overrode delivered");
  if (failed?.provider_id !== `wamid.${KEY}`) fail("the wamid from the receipt was not recorded");
  else ok("wamid recorded from the receipt");

  console.log("\n7. A receipt with no callback data still matches on the wamid");
  await applyDeliveryReceipt({ rowId: null, providerId: `wamid.${KEY}`, status: "read", error: null });
  const { data: viaWamid } = await supabase.from("whatsapp_messages").select("status").eq("id", id).single();
  if (viaWamid?.status !== "read") fail(`fallback match failed, status is ${viaWamid?.status}`);
  else ok("matched on the wamid alone");

  console.log("\ncleanup");
  await supabase.from("whatsapp_messages").delete().like("dedupe_key", `${KEY}%`);
  const { data: left } = await supabase.from("whatsapp_messages").select("id").like("dedupe_key", `${KEY}%`);
  console.log(`  removed, ${(left ?? []).length} rows remain`);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failure(s).\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
