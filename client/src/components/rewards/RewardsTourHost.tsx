import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import 'driver.js/dist/driver.css';
import { useAppStore } from '@/lib/store';
import { useRewardsAccess } from '@/lib/rewardsAccess';
import { useRewardsStore } from '@/lib/rewardsStore';
import { startRewardsTour, stopRewardsTour, useRewardsTour } from '@/lib/rewardsTour';
import { useToast } from '@/hooks/use-toast';

/**
 * The rewards demo's ties to the rest of the app. Renders nothing.
 *
 *  - `?tour=rewards` on any customer screen starts the demo, so a link can be
 *    sent to whoever is presenting it. A guest gets a sign-in hint instead.
 *  - The demo stops if the session ends under it.
 *  - The demo figures belong to one account: signing in as another starts
 *    that account afresh rather than showing someone else's balance.
 */
export function RewardsTourHost(): null {
  const rewardsOn = useRewardsAccess();
  const userId = useAppStore((s) => s.user?.id);
  const bindOwner = useRewardsStore((s) => s.bindOwner);
  const running = useRewardsTour((s) => s.running);
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (userId) bindOwner(userId);
  }, [userId, bindOwner]);

  useEffect(() => {
    if (running && !rewardsOn) stopRewardsTour();
  }, [running, rewardsOn]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get('tour') !== 'rewards') return;
    params.delete('tour');
    const rest = params.toString();
    setLocation(`${location}${rest ? `?${rest}` : ''}`, { replace: true });

    if (!rewardsOn) {
      toast({ title: 'Sign in to watch the rewards demo', description: 'Rewards are for account holders.' });
      return;
    }
    if (location !== '/rewards') setLocation('/rewards');
    startRewardsTour();
  }, [search, location, rewardsOn, setLocation, toast]);

  return null;
}
