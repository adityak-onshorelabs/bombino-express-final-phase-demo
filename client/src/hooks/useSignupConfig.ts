import { useQuery } from '@tanstack/react-query';

/**
 * What the signup form is allowed to offer on this deployment.
 *
 * Read before an account exists, so the endpoint behind it is unauthenticated.
 * It discloses one boolean about policy and nothing about any person.
 *
 * The client cannot grant itself anything by lying about this — the server
 * re-checks its own flag on every signup — so it decides only whether the
 * "Skip for now" affordance is drawn at all. Showing a button that the server
 * would then refuse is the failure this prevents.
 */
export interface SignupConfig {
  /** Personal accounts may defer their documents. See server/kycOptional.ts. */
  kyc_optional: boolean;
}

export function useSignupConfig() {
  return useQuery({
    queryKey: ['/api/signup/config'],
    queryFn: async (): Promise<SignupConfig> => {
      const res = await fetch('/api/signup/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not read signup config');
      return (await res.json()) as SignupConfig;
    },
    // Changes only when someone edits an env var and restarts the server, so
    // refetching it on focus would be noise. Same reasoning as usePaymentsConfig.
    staleTime: Infinity,
    retry: false,
  });
}
