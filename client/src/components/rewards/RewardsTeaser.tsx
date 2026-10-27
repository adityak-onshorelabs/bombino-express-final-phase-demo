import { Link } from 'wouter';
import { ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInrShort, formatKg, formatPoints, progressFor } from '@/lib/rewards';
import { useRewardsStore } from '@/lib/rewardsStore';
import { useRewardsAccess } from '@/lib/rewardsAccess';
import { TierEmblem } from './TierEmblem';

/**
 * The rewards card on Home: the tier, how close the next one is, and the
 * points balance, in one tap-through. It shows the single closest route to
 * the next tier, not both, and leaves the detail to /rewards.
 */
export function RewardsTeaser({ className }: { className?: string }) {
  const member = useRewardsStore((s) => s.member);
  const rewardsOn = useRewardsAccess();
  if (!rewardsOn) return null;
  const p = progressFor(member.billing, member.weightKg);
  const pct = Math.round(p.pct * 100);
  const closest =
    p.leading === 'weight' ? `${formatKg(p.weightLeft)} more` : `${formatInrShort(p.valueLeft)} more`;

  return (
    <Link
      href="/rewards"
      className={cn(
        'group relative block overflow-hidden rounded-lg bg-gradient-to-br from-[#2F4468] to-[#16243A] p-4 text-white shadow-[0_8px_28px_oklch(17%_0.048_248/0.22)] transition-transform active:scale-[0.99]',
        className,
      )}
      data-testid="card-rewards-teaser"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#F2A123]/15 blur-2xl"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <TierEmblem tier={p.current} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#F7C35C]">Bombino Rewards</p>
          <p className="truncate text-base font-bold leading-tight">{p.current.name} member</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm bg-white/10 px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-white/15">
          <Sparkles className="h-3.5 w-3.5 text-[#F7C35C]" />
          {formatPoints(member.points)} pts
        </span>
      </div>

      <div className="relative mt-4">
        {p.next ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold">
                {pct}% to {p.next.name}
              </span>
              <span className="text-white/65">{closest}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-white/12">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-[#F7C35C] to-[#F2A123]"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-xs font-semibold text-[#F7C35C]">You're at the top tier.</p>
        )}
      </div>

      <div className="relative mt-3 flex items-center justify-end gap-0.5 text-xs font-semibold text-[#F7C35C]">
        View rewards
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
