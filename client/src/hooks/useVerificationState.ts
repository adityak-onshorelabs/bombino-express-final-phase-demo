import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { DocSlot } from '@shared/accountSpec';

/**
 * What the signed-in account still owes before it counts as verified.
 *
 * Derived server-side from `account_documents` by the same predicate the signup
 * gate and the docket guard use (shared/accountSpec.ts §verificationState), so
 * the banner cannot say "you're done" while ops still holds the order.
 *
 * Deliberately NOT on the Zustand store: `AuthUser` is persisted to
 * localStorage, and a verification flag kept there would survive the upload
 * that invalidates it. This is a live read, shared by every consumer through
 * one cache entry.
 */
export interface VerificationState {
  verified: boolean;
  /** Required slots with nothing uploaded. */
  missing: DocSlot[];
  /** Uploaded, but OCR never confirmed them — a blurred scan, or an outage. */
  unverified: DocSlot[];
  account_type: 'personal' | 'company';
  company_category: string | null;
  required: DocSlot[];
}

export const VERIFICATION_QUERY_KEY = ['/api/account/verification'] as const;

async function fetchVerificationState(): Promise<VerificationState | null> {
  const res = await fetch('/api/account/verification', {
    credentials: 'include',
    cache: 'no-store',
  });
  // Signed out. Null rather than a throw: the banner mounts app-wide and a
  // logged-out visitor is not an error state.
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to load verification status');
  return (await res.json()) as VerificationState;
}

export function useVerificationState(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: VERIFICATION_QUERY_KEY,
    queryFn: fetchVerificationState,
    enabled: options?.enabled ?? true,
    // Global default is `staleTime: Infinity`. This has to re-read on mount:
    // a document uploaded on the profile screen must clear the banner on the
    // next screen without a reload.
    staleTime: 0,
    retry: false,
  });
}

/**
 * Write the state an upload returned straight into the shared cache.
 *
 * The upload endpoints answer with the recomputed state, so the banner can
 * clear on the same round trip instead of after a refetch the customer waits
 * for. Still invalidated afterwards, so the server stays the authority.
 */
export function publishVerificationState(
  client: QueryClient,
  state: VerificationState
): void {
  client.setQueryData(VERIFICATION_QUERY_KEY, state);
  void client.invalidateQueries({ queryKey: VERIFICATION_QUERY_KEY });
}

/** Drop the cached state — after a sign-out, or an upload that returned none. */
export function invalidateVerificationState(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: VERIFICATION_QUERY_KEY });
}
