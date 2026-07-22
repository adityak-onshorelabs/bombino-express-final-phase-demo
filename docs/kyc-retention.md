# KYC document retention (placeholder)

This document records the current KYC storage posture and deferred work.

## Current posture (Phase 1–4)

- One identity document per user (`UNIQUE(user_id)` on `kyc_documents`).
- File bytes stored as **base64 in Postgres** (`file_data` column) — **unencrypted at rest**.
- ITD receives a stable capability URL: `{PUBLIC_URL}/api/kyc/documents/{capability_id}/file`.
- The capability UUID is generated on first upload and **never rotated** on replace; the file behind the URL is overwritten.
- Access to bytes is server-side only (service-role Supabase client); browsers and ITD hit the app-proxied serve endpoint.

## Accepted risk (confirm with Anas)

If a user **replaces** their document, older ITD dockets that stored the same `file_path` will resolve to the **new file** on any late or async re-fetch by ITD.

## Deferred (out of scope)

- Encryption at rest
- Retention policies and consent flows
- Document deletion / right-to-erasure workflows
- Immutable versioning or per-docket snapshots
- Migration to Supabase Storage (if pursued later)
