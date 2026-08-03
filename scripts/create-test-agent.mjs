/**
 * Create (or promote) a pickup-agent account for A5 testing.
 *
 * No signup endpoint issues the `agent` role — A2 hardcodes `customer`, and
 * M7's user management may never be built. So agents are made here until
 * someone owns that screen.
 *
 * Usage:
 *   node --env-file=.env scripts/create-test-agent.mjs <phone> [full_name]
 *   node --env-file=.env scripts/create-test-agent.mjs 9000000001 "Test Agent One"
 *
 * Idempotent: an existing account on that phone is promoted to `agent` rather
 * than duplicated (`itd_users.phone` is uniquely indexed, so a second insert
 * would fail anyway).
 *
 * WRITES TO THE SHARED SUPABASE PROJECT. Rows created here are visible to
 * everyone on the project — use obviously-fake numbers.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [, , phoneArg, ...nameParts] = process.argv;

if (!phoneArg || !/^\d{10}$/.test(phoneArg)) {
  console.error('Usage: node --env-file=.env scripts/create-test-agent.mjs <10-digit-phone> [full_name]');
  console.error('The phone must be 10 digits — /api/auth/login/otp rejects anything else.');
  process.exit(1);
}

const phone = phoneArg;
const fullName = nameParts.join(' ') || `Test Agent ${phone.slice(-4)}`;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (pass --env-file=.env).');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: existing, error: lookupError } = await db
  .from('itd_users')
  .select('id, phone, full_name, role, account_type')
  .eq('phone', phone)
  .maybeSingle();

if (lookupError) {
  console.error('Lookup failed:', lookupError.code, lookupError.message);
  process.exit(1);
}

if (existing) {
  if (existing.role === 'agent') {
    console.log(`Already an agent — nothing to do.`);
    console.log({ id: existing.id, phone, full_name: existing.full_name, role: existing.role });
    process.exit(0);
  }

  const { data: promoted, error: promoteError } = await db
    .from('itd_users')
    .update({ role: 'agent', updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select('id, phone, full_name, role, account_type')
    .single();

  if (promoteError) {
    console.error('Promote failed:', promoteError.code, promoteError.message);
    process.exit(1);
  }
  console.log(`Promoted existing account from "${existing.role}" to "agent".`);
  console.log(promoted);
  process.exit(0);
}

// Synthetic id, same convention as the OTP signup path: these accounts do not
// exist inside ITD and never authenticate against it.
const syntheticId = `local-${randomUUID()}`;

const { data: created, error: insertError } = await db
  .from('itd_users')
  .insert({
    itd_customer_id: syntheticId,
    itd_customer_code: syntheticId,
    full_name: fullName,
    email: '',
    username: phone,
    phone,
    role: 'agent',
    // account_type deliberately not set. It is a customer field — it picks
    // Aadhaar vs GST at signup and drives the KYC branch at booking — and
    // means nothing for staff. But the column is NOT NULL with a two-value
    // CHECK ('personal','company'), so the row cannot opt out: the DEFAULT
    // fills in 'personal' regardless. Letting the default do it keeps this
    // script from asserting something untrue about the account.
    // `role` is the real discriminator everywhere that matters.
    is_active: true,
    metadata: { seeded_by: 'scripts/create-test-agent.mjs', seeded_at: new Date().toISOString() },
  })
  .select('id, phone, full_name, role, account_type')
  .single();

if (insertError) {
  console.error('Insert failed:', insertError.code, insertError.message);
  process.exit(1);
}

console.log('Created agent account:');
console.log(created);
console.log('\nLog in as this agent:');
console.log(`  1. POST /api/auth/otp/request  { "phone": "${phone}", "purpose": "login" }`);
console.log(`  2. POST /api/auth/otp/verify   { "phone": "${phone}", "purpose": "login", "code": "000000" }`);
console.log(`  3. POST /api/auth/login/otp    { "phone": "${phone}" }`);
console.log('\n  (step 2 accepts any 6-digit code — the OTP comparison is still stubbed)');
