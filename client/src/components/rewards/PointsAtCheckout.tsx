import { Link } from 'wouter';
import { Minus, Plus, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  REDEEM_MIN_POINTS,
  RUPEES_PER_REDEEMED_POINT,
  formatPoints,
  maxPointsFor,
  pointsDiscount,
  progressFor,
} from '@/lib/rewards';
import { useRewardsStore } from '@/lib/rewardsStore';
import { formatInr } from '@/lib/itdRates';
import { TierEmblem } from './TierEmblem';

const STEP = 10;

interface PointsAtCheckoutProps {
  /** Amount due before points, incl. GST. */
  payable: number;
  /** Points chosen. 0 means the switch is off. */
  points: number;
  onPointsChange: (points: number) => void;
  className?: string;
}

/**
 * "Use reward points", shown wherever a customer pays: the Review & Pay step
 * of a booking and the Payment due task on an order.
 *
 * Off by default. Switching it on takes as many points as the payment allows,
 * which is usually what someone means by turning it on. They can then step
 * down by 10s or drag the slider. Two cases cannot be switched on, and each
 * says why instead of only showing a disabled toggle: a balance under the
 * 100-point minimum, and a payment too small to take 100 points.
 *
 * UI only for now. The points come off the demo balance once the booking or
 * payment goes through, but the gateway is still charged the full amount
 * until the API takes a points field (see docs/rewards/rewards-logic.md).
 */
export function PointsAtCheckout({ payable, points, onPointsChange, className }: PointsAtCheckoutProps) {
  const member = useRewardsStore((s) => s.member);
  const balance = member.points;
  const tier = progressFor(member.billing, member.weightKg).current;
  const max = maxPointsFor(balance, payable);
  const on = points > 0;

  const shortOfMinimum = balance < REDEEM_MIN_POINTS;
  const paymentTooSmall = !shortOfMinimum && max < REDEEM_MIN_POINTS;
  const usable = !shortOfMinimum && !paymentTooSmall;

  const clamp = (n: number): number => Math.min(Math.max(n, REDEEM_MIN_POINTS), max);

  return (
    <section
      className={cn(
        'rounded-lg border p-3.5 transition-colors',
        on ? 'border-[#F2A123] bg-[#F2A123]/[0.07]' : 'border-[#E2E8F0] bg-white',
        className,
      )}
      data-testid="card-points-at-checkout"
    >
      <div className="flex items-center gap-3">
        <TierEmblem tier={tier} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[lab(34.0831_-9.57756_-27.7093)]">Use reward points</p>
          <p className="text-xs text-[#64748B]">
            <span className="font-semibold tabular-nums text-[#334155]">{formatPoints(balance)}</span> available · 1 pt = ₹
            {RUPEES_PER_REDEEMED_POINT}
          </p>
        </div>
        <Switch
          checked={on}
          disabled={!usable}
          onCheckedChange={(checked) => onPointsChange(checked ? max : 0)}
          aria-label="Use reward points"
          data-testid="switch-use-points"
        />
      </div>

      {shortOfMinimum && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-sm bg-[#F3F4F6]">
            <div
              className="h-full rounded-sm bg-gradient-to-r from-[#F7C35C] to-[#F2A123]"
              style={{ width: `${(balance / REDEEM_MIN_POINTS) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-[#64748B]">
            {REDEEM_MIN_POINTS - balance} more points and you can use them on a payment.
          </p>
        </div>
      )}

      {paymentTooSmall && (
        <p className="mt-2.5 text-xs text-[#64748B]">
          Points can be used on payments of {formatInr(pointsDiscount(REDEEM_MIN_POINTS))} or more.
        </p>
      )}

      {on && (
        <div className="mt-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPointsChange(clamp(points - STEP))}
              disabled={points <= REDEEM_MIN_POINTS}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#F2A123]/60 disabled:opacity-40"
              aria-label="Use 10 fewer points"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-xl font-extrabold leading-none tabular-nums text-[lab(34.0831_-9.57756_-27.7093)]">
                {formatPoints(points)}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">points</p>
            </div>
            <button
              type="button"
              onClick={() => onPointsChange(clamp(points + STEP))}
              disabled={points >= max}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#F2A123]/60 disabled:opacity-40"
              aria-label="Use 10 more points"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {max > REDEEM_MIN_POINTS && (
            <input
              type="range"
              className="h-2 w-full cursor-pointer appearance-none rounded-sm bg-white accent-[#F2A123]"
              min={REDEEM_MIN_POINTS}
              max={max}
              step={1}
              value={points}
              onChange={(e) => onPointsChange(clamp(Number(e.target.value)))}
              aria-label="Points to use"
            />
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#64748B]">
              {points === max ? (
                balance > max ? 'Most this payment can take' : 'All your points'
              ) : (
                <button
                  type="button"
                  onClick={() => onPointsChange(max)}
                  className="font-semibold text-[#B76E00] underline-offset-2 hover:underline"
                >
                  Use max ({formatPoints(max)})
                </button>
              )}
            </span>
            <span className="font-bold tabular-nums text-emerald-700">− {formatInr(pointsDiscount(points))}</span>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The points a payment will earn, on what is actually paid excl. GST. Earned
 * once the order settles, so the copy says "will".
 */
export function PointsEarnNote({ points, className }: { points: number; className?: string }) {
  if (points <= 0) return null;
  return (
    <div className={cn('flex items-start gap-1.5 text-xs text-[#64748B]', className)} data-testid="text-points-earn">
      <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-[#F2A123]" />
      <p className="min-w-0 flex-1 leading-snug">
        You'll earn <span className="font-semibold text-[#B76E00]">{formatPoints(points)} points</span> once this
        order settles.
      </p>
      <Link href="/rewards" className="shrink-0 font-semibold text-[#2F4468] underline-offset-2 hover:underline">
        Rewards
      </Link>
    </div>
  );
}
