import { useAppStore } from './store';
import { surfaceForRole } from './surface';

/**
 * Whether this visitor may see Bombino Rewards at all.
 *
 * Rewards are for direct clients with an account. A guest, verified number or
 * not, has no account to hold a balance against, so nothing about rewards is
 * shown to them: no Home card, no menu link, no points at checkout and no
 * /rewards screen. Staff and agents have their own surfaces and never reach
 * the customer screens, but the role is checked too so a stale session cannot
 * slip through.
 */
export function canSeeRewards(isLoggedIn: boolean, role: string | undefined): boolean {
  return isLoggedIn && surfaceForRole(role) === 'customer';
}

export function useRewardsAccess(): boolean {
  const isLoggedIn = useAppStore((s) => s.isLoggedIn);
  const role = useAppStore((s) => s.user?.role);
  return canSeeRewards(isLoggedIn, role);
}
