# KYC document retention (placeholder)

This document records the current KYC storage posture and deferred work.

## Current posture (Phase 1–4)

- One identity document per user (`UNIQUE(user_id)` on `kyc_documents`).
- File bytes stored as **base64 in Postgres** (`file_data` column) — **unencrypted at rest**.
- ITD receives a stable capability URL: `{PUBLIC_URL}/api/kyc/documents/{capability_id}/file`.
- The capability UUID is generated on first upload and **never rotated** on replace; the file behind the URL is overwritten.
- Access to bytes is server-side only (service-role Supabase client); browsers and ITD hit the app-proxied serve endpoint.
- Owner preview: `GET /api/kyc/me/file` streams the **session user's own** document (auth required, no capability id in the URL). Used by the in-app preview card.
- `GET /api/kyc/me` returns metadata only — `document_type`, `last_four`, `original_filename`, `mime_type`, `file_size_bytes`, `updated_at` — never the raw number or bytes.
- Both KYC serve endpoints send `Cache-Control: no-store`, since a replace reuses the same `capability_id`.

## Accounts with no KYC document

Since `KYC_OPTIONAL` (`server/kycOptional.ts`), a **personal** account can exist
with no `kyc_documents` row at all — the customer skipped the step at signup and
has not come back yet.

- `getKycByUserId` returns null for them, so nothing here changes shape; the
  readers already handle the absent case.
- Their orders are held at `generate_docket` (`isKycHeld`, see
  `docs/final-phase/markdowns/open-items.md` §4.6), so an undocketed order never
  reaches ITD without a document behind it.
- The document set of record is still `account_documents`; `kyc_documents` is
  what customs reads. A personal Aadhaar reaching `match` through **either**
  upload path — signup, the profile document centre, or `/api/kyc/upload` — is
  mirrored into both, so "verified" cannot mean two different things.

## Accepted risk (confirm with Anas)

If a user **replaces** their document, older ITD dockets that stored the same `file_path` will resolve to the **new file** on any late or async re-fetch by ITD.

## Deferred (out of scope)

- Encryption at rest
- Retention policies and consent flows
- Document deletion / right-to-erasure workflows
- Immutable versioning or per-docket snapshots
- Migration to Supabase Storage (if pursued later)
