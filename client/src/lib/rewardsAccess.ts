import { useAppStore, type AuthUser } from './store';
import { surfaceForRole } from './surface';

/**
 * The account the rewards demo signs in as (lib/rewardsTour). It exists only in
 * this browser: a linked account holder, so the demo shows everything an
 * account sees, without a real sign-in or a server. Nothing sent to the API on
 * its behalf can succeed, so the session guards in lib/session ignore it.
 */
export const DEMO_MEMBER: AuthUser = {
  id: 'rewards-demo-member',
  customerId: 'DEMO',
  code: 'DEMO',
  email: 'demo.member@bombino.demo',
  fullName: 'Demo Member',
  username: 'demo.member',
  role: 'customer',
  account_type: 'personal',
};

export function isDemoMember(user: AuthUser | null | undefined): boolean {
  return user?.id === DEMO_MEMBER.id;
}

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
