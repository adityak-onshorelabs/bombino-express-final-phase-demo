import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import 'driver.js/dist/driver.css';
import { useAppStore } from '@/lib/store';
import { isDemoMember, useRewardsAccess } from '@/lib/rewardsAccess';
import { useRewardsStore } from '@/lib/rewardsStore';
import { startRewardsTour, stopRewardsTour, useRewardsTour } from '@/lib/rewardsTour';

/**
 * The rewards demo's ties to the rest of the app. Renders nothing.
 *
 *  - `?tour=rewards` on any customer screen starts the demo, so a link can be
 *    sent to whoever is presenting it. It needs no sign-in: the demo runs as
 *    its own account (lib/rewardsTour).
 *  - A demo session left behind by a closed tab is cleared on the next load,
 *    so nobody finds themselves signed in as "Demo Member".
 *  - The demo stops if the session ends under it.
 *  - The demo figures belong to one account: signing in as another starts
 *    that account afresh rather than showing someone else's balance.
 */
export function RewardsTourHost(): null {
  const rewardsOn = useRewardsAccess();
  const user = useAppStore((s) => s.user);
  const bindOwner = useRewardsStore((s) => s.bindOwner);
  const running = useRewardsTour((s) => s.running);
  const search = useSearch();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (running) return;
    if (isDemoMember(user)) useAppStore.setState({ isLoggedIn: false, user: null });
    else if (user?.id) bindOwner(user.id);
  }, [running, user, bindOwner]);

  useEffect(() => {
    if (running && !rewardsOn) stopRewardsTour();
  }, [running, rewardsOn]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get('tour') !== 'rewards') return;
    params.delete('tour');
    const rest = params.toString();
    setLocation(`${location}${rest ? `?${rest}` : ''}`, { replace: true });
    startRewardsTour();
  }, [search, location, setLocation]);

  return null;
}
