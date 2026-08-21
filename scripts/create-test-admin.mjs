/**
 * Create (or promote) admin / super_admin accounts for ops-console testing.
 *
 * Mirrors scripts/create-test-agent.mjs — sibling seed, agent script untouched.
 *
 * Usage:
 *   node --env-file=.env scripts/create-test-admin.mjs
 *
 * Seeds two fixed phones (idempotent promote/create per phone):
 *   9000000010 → admin
 *   9000000011 → super_admin
 *
 * WRITES TO THE SHARED SUPABASE PROJECT. Use only these obviously-fake numbers.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ACCOUNTS = [
  { phone: '9000000010', role: 'admin', full_name: 'Test Admin' },
  { phone: '9000000011', role: 'super_admin', full_name: 'Test Super Admin' },
];

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (pass --env-file=.env).');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function ensureStaffAccount({ phone, role, full_name }) {
  console.log(`\n── ${role} (${phone}) ──`);

  const { data: existing, error: lookupError } = await db
    .from('itd_users')
    .select('id, phone, full_name, role, account_type')
    .eq('phone', phone)
    .maybeSingle();

  if (lookupError) {
    console.error(`[${phone}] Lookup failed: `, lookupError);
    process.exit(1);
  }

  if (existing) {
    if (existing.role === role) {
      console.log(`Already ${role} — nothing to do.`);
      console.log({
        id: existing.id,
        phone,
        full_name: existing.full_name,
        role: existing.role,
        account_type: existing.account_type,
      });
      printLogin(phone);
      return;
    }

    const { data: promoted, error: promoteError } = await db
      .from('itd_users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('id, phone, full_name, role, account_type')
      .single();

    if (promoteError) {
      console.error(`[${phone}] Promote failed:`, promoteError.code, promoteError.message);
      process.exit(1);
    }
    console.log(`Promoted existing account from "${existing.role}" to "${role}".`);
    console.log(promoted);
    printLogin(phone);
    return;
  }

  const syntheticId = `local-${randomUUID()}`;

  const { data: created, error: insertError } = await db
    .from('itd_users')
    .insert({
      itd_customer_id: syntheticId,
      itd_customer_code: syntheticId,
      full_name,
      email: '',
      username: phone,
      phone,
      role,
      is_active: true,
      metadata: {
        seeded_by: 'scripts/create-test-admin.mjs',
        seeded_at: new Date().toISOString(),
      },
    })
    .select('id, phone, full_name, role, account_type')
    .single();

  if (insertError) {
    console.error(`[${phone}] Insert failed:`, insertError.code, insertError.message);
    process.exit(1);
  }

  console.log(`Created ${role} account:`);
  console.log(created);
  printLogin(phone);
}

function printLogin(phone) {
  console.log('Log in:');
  console.log(`  1. POST /api/auth/otp/request  { "phone": "${phone}", "purpose": "login" }`);
  console.log(`  2. POST /api/auth/otp/verify   { "phone": "${phone}", "purpose": "login", "code": "000000" }`);
  console.log(`  3. POST /api/auth/login/otp    { "phone": "${phone}" }`);
  console.log('  (step 2 accepts any 6-digit code — the OTP comparison is still stubbed)');
}

for (const account of ACCOUNTS) {
  await ensureStaffAccount(account);
}

console.log('\nDone.');
