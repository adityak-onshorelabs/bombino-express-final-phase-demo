/**
 * Push ONE unclaimed pickup into the Calls pool, for looking at the agent app.
 *
 * `seed-dummy-agents.mjs` seeds the whole world and refuses to run twice
 * without `--reset`, which throws away whatever state you had reached by
 * clicking through the app. This script exists for the other case: the pool is
 * empty because every seeded job has been taken, and you want one free job back
 * so the New-jobs rail on `/agent` has something in it.
 *
 * Purely additive. It inserts one order and its one event row, and deletes
 * nothing — the only way it touches existing data is by reading a seeded order
 * to copy the customer, address and consignee off, so the new job looks like
 * every other job rather than like a fixture.
 *
 * Usage:
 *   node --env-file=.env scripts/push-unclaimed-job.mjs
 *   node --env-file=.env scripts/push-unclaimed-job.mjs --late   # dated yesterday
 *
 * WRITES TO THE SHARED SUPABASE PROJECT. The row is tagged
 * `metadata.seeded_by = 'scripts/push-unclaimed-job.mjs'`, so it is greppable
 * and removable on its own, and `seed-dummy-agents.mjs --reset` will NOT sweep
 * it up (that matches only its own tag).
 */

import { createClient } from '@supabase/supabase-js';

const SEED_TAG = 'scripts/push-unclaimed-job.mjs';
const SOURCE_TAG = 'scripts/seed-dummy-agents.mjs';
const LATE = process.argv.includes('--late');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (pass --env-file=.env).');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function die(what, error) {
  console.error(`${what} failed:`, error?.code ?? '', error?.message ?? error);
  process.exit(1);
}

// Pickup dates are bare `date` columns compared against IST everywhere else
// (shared/pickupSlots.ts), so today is computed in IST here too. A UTC-derived
// "today" flips a day early every Indian evening and would quietly file a fresh
// job as overdue.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istDate(offsetDays = 0) {
  return new Date(Date.now() + IST_OFFSET_MS + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// ── Copy the shape of a job that already exists ─────────────────────────────
// Rather than hardcoding a customer, an address and a consignee payload that
// would drift from the seed script the first time either changed.
const { data: source, error: sourceError } = await db
  .from('orders')
  .select('user_id, origin_address_id, consignee, items')
  .eq('metadata->>seeded_by', SOURCE_TAG)
  .not('origin_address_id', 'is', null)
  .limit(1)
  .maybeSingle();
if (sourceError) die('read a seeded order', sourceError);

if (!source) {
  console.error(
    '\nNo seeded order to copy from. Seed the world first:\n' +
      '  node --env-file=.env scripts/seed-dummy-agents.mjs'
  );
  process.exit(1);
}

const { data: order, error } = await db
  .from('orders')
  .insert({
    user_id: source.user_id,
    // Unclaimed: no agent, and the status the pool is keyed on.
    status: 'pickup_requested',
    agent_id: null,
    pickup_request: 1,
    pickup_date: istDate(LATE ? -1 : 0),
    pickup_slot: LATE ? '13:00-15:00' : '15:00-17:00',
    origin_address_id: source.origin_address_id,
    consignee: source.consignee,
    items: source.items,
    booked_weight: 5.4,
    quoted_amount: 5860,
    // Money owed at the door, so the job carries an amount through the flow.
    payment_method: 'pay_at_pickup',
    payment_status: 'pending',
    is_cod: false,
    metadata: { seeded_by: SEED_TAG, seeded_at: new Date().toISOString() },
  })
  .select('id, order_no, pickup_date, pickup_slot')
  .single();
if (error) die('insert order', error);

// The one event a just-booked order would have. Attributed to the customer,
// because that is who books; nothing has happened to it since.
const { error: eventError } = await db.from('order_events').insert({
  order_id: order.id,
  status: 'pickup_requested',
  note: 'seeded',
  actor_user_id: source.user_id,
  metadata: { seeded_by: SEED_TAG, seeded_at: new Date().toISOString() },
});
if (eventError) die('insert order event', eventError);

console.log(
  `\nPushed ${order.order_no} — unclaimed, ${order.pickup_date} ${order.pickup_slot}` +
    `${LATE ? ' (late)' : ''}.\n` +
    'It is in the Calls pool now: open /agent and it leads the New jobs rail.\n'
);
