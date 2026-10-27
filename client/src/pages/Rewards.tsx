import { Link } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { format, parseISO, isValid } from 'date-fns';
import {
  ArrowLeft,
  Check,
  Clock,
  Gift,
  Lock,
  Package,
  PlayCircle,
  Plus,
  RotateCcw,
  Scale,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEMO_SCENARIOS,
  REDEEM_MIN_POINTS,
  RUPEES_PER_POINT,
  TIERS,
  formatInrShort,
  formatKg,
  formatPoints,
  pointsDiscount,
  progressFor,
  rewardsYear,
  type PendingEarn,
  type PointsEntry,
  type RewardsMember,
  type TierProgress,
} from '@/lib/rewards';
import { useRewardsStore } from '@/lib/rewardsStore';
import { startRewardsTour, useRewardsTour } from '@/lib/rewardsTour';
import { useCountUp } from '@/hooks/useCountUp';
import { useToast } from '@/hooks/use-toast';
import { TierEmblem } from '@/components/rewards/TierEmblem';
import { PathBar, ProgressRing } from '@/components/rewards/ProgressRing';
import { formatInr } from '@/lib/itdRates';
import { TierUpCelebration } from '@/components/rewards/TierUpCelebration';

const NAVY = 'text-[lab(34.0831_-9.57756_-27.7093)]';

/**
 * Bombino Rewards.
 *
 * UI only for now. The figures come from the demo store (lib/rewardsStore),
 * and the rules come from lib/rewards, which mirrors
 * docs/rewards/rewards-logic.md.
 *
 * Mobile is a single column in reading order: tier, points, journey, activity.
 * Desktop splits it so the tier and the journey sit on the left and the money
 * side on the right. `contents` on the column wrappers lets the mobile order
 * differ from the desktop columns without rendering anything twice.
 */
export default function Rewards() {
  const member = useRewardsStore((s) => s.member);
  const tierUp = useRewardsStore((s) => s.tierUp);
  const dismissTierUp = useRewardsStore((s) => s.dismissTierUp);

  const progress = progressFor(member.billing, member.weightKg);

  return (
    <div className="min-h-[100dvh] bg-background pb-10" data-testid="screen-rewards">
      <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-white/95 shadow-[0_1px_3px_oklch(17%_0.048_248_/_0.06)] backdrop-blur-sm safe-top md:hidden">
        <div className="mx-auto flex h-14 max-w-md items-center px-4">
          <button
            onClick={() => window.history.back()}
            className="-ml-2 rounded-xl p-2 transition-all hover:bg-muted active:scale-95"
            aria-label="Back"
            data-testid="button-back-rewards"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="ml-2 text-sm font-semibold">Rewards</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5 md:grid md:max-w-none md:grid-cols-12 md:items-start md:gap-6 md:px-0 md:py-0">
        <div className="contents md:col-span-7 md:flex md:flex-col md:gap-6">
          <TierHero progress={progress} member={member} className="order-1" />
          <MilestoneRoad progress={progress} className="order-3" />
        </div>
        <div className="contents md:col-span-5 md:flex md:flex-col md:gap-6">
          <PointsWallet points={member.points} pending={member.pending} className="order-2" />
          <Activity history={member.history} pending={member.pending} className="order-4" />
          <HowItWorks className="order-5" />
          <DemoControls className="order-6" />
        </div>
      </main>

      <TierUpCelebration tierId={tierUp} onClose={dismissTierUp} />
    </div>
  );
}

// ─── Tier hero ──────────────────────────────────────────────────────────────

function TierHero({
  progress,
  member,
  className,
}: {
  progress: TierProgress;
  member: RewardsMember;
  className?: string;
}) {
  const { current, next } = progress;
  const year = rewardsYear();
  const pct = Math.round(progress.pct * 100);

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-lg bg-gradient-to-br from-[#2F4468] via-[#22365A] to-[#0C1A25] p-5 text-white shadow-[0_16px_48px_oklch(17%_0.048_248/0.28)] md:p-7',
        className,
      )}
      data-testid="rewards-tier-hero"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#F2A123]/20 blur-3xl" aria-hidden />
      <HexPattern />

      <div className="relative flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F7C35C]">Bombino Rewards</p>
        <span className="rounded-sm bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 ring-1 ring-white/10">
          {year.label} · {year.daysLeft} days left
        </span>
      </div>

      <div className="relative mt-5 flex items-center gap-4">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 16 }}
        >
          <TierEmblem tier={current} size={76} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/60">You're a</p>
          <p className="text-[28px] font-extrabold leading-none tracking-tight md:text-[34px]">{current.name}</p>
          <p className="mt-1 text-xs text-white/60">member</p>
        </div>
        {next && (
          <ProgressRing value={progress.pct} size={96} stroke={9} label={`${pct}% of the way to ${next.name}`}>
            <span className="text-xl font-extrabold leading-none tabular-nums">{pct}%</span>
            <span className="mt-0.5 text-[10px] font-medium text-white/60">to {next.name}</span>
          </ProgressRing>
        )}
      </div>

      {next ? (
        <div className="relative mt-6 space-y-4">
          <PathBar
            label="Billing (excl. GST)"
            detail={`${formatInrShort(member.billing)} of ${formatInrShort(next.value)}`}
            value={progress.valuePct}
            leading={progress.leading === 'value'}
          />
          <PathBar
            label="Weight shipped"
            detail={`${formatKg(member.weightKg)} of ${formatKg(next.weightKg)}`}
            value={progress.weightPct}
            leading={progress.leading === 'weight'}
          />
          <p className="rounded-md bg-white/[0.06] px-4 py-3 text-[13px] leading-relaxed text-white/80 ring-1 ring-white/10">
            <span className="font-semibold text-white">{formatInrShort(progress.valueLeft)}</span> more billing or{' '}
            <span className="font-semibold text-white">{formatKg(progress.weightLeft)}</span> more unlocks{' '}
            <span className="font-semibold text-[#F7C35C]">{next.name}</span>. Whichever comes first.
          </p>
        </div>
      ) : (
        <div className="relative mt-6 grid grid-cols-2 gap-3">
          <p className="col-span-2 text-sm font-semibold text-[#F7C35C]">You've reached the top tier.</p>
          <HeroStat icon={TrendingUp} label="Billed this year" value={formatInrShort(member.billing)} />
          <HeroStat icon={Scale} label="Shipped this year" value={formatKg(member.weightKg)} />
        </div>
      )}
    </section>
  );
}

function HeroStat({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
      <Icon className="h-4 w-4 text-[#F7C35C]" />
      <p className="mt-2 text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-white/60">{label}</p>
    </div>
  );
}

/** Faint hexagons in the hero's corner, echoing the badge shape. */
function HexPattern() {
  return (
    <svg className="pointer-events-none absolute -bottom-6 -left-6 h-40 w-40 text-white/[0.05]" viewBox="0 0 100 100" aria-hidden>
      {[
        [20, 20],
        [50, 20],
        [35, 46],
        [65, 46],
        [20, 72],
        [50, 72],
      ].map(([x, y]) => (
        <polygon
          key={`${x}-${y}`}
          points={`${x},${y - 13} ${x + 11},${y - 6.5} ${x + 11},${y + 6.5} ${x},${y + 13} ${x - 11},${y + 6.5} ${x - 11},${y - 6.5}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

// ─── Points wallet ──────────────────────────────────────────────────────────

function PointsWallet({
  points,
  pending,
  className,
}: {
  points: number;
  pending: PendingEarn[];
  className?: string;
}) {
  const lastEarn = useRewardsStore((s) => s.lastEarn);
  const onTheWay = pending.reduce((sum, p) => sum + p.points, 0);
  const shown = useCountUp(points);
  const canRedeem = points >= REDEEM_MIN_POINTS;
  const toUnlock = REDEEM_MIN_POINTS - points;

  return (
    <section className={cn('rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_12px_oklch(17%_0.048_248/0.06)]', className)} data-testid="rewards-wallet">
      <div className="flex items-center justify-between">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold', NAVY)}>
          <Wallet className="h-4 w-4 text-[#F2A123]" />
          Your points
        </h2>
        <span className="text-[11px] text-[#64748B]">₹{RUPEES_PER_POINT} billed = 1 point</span>
      </div>

      <div className="relative mt-3 flex items-end gap-2">
        <p className={cn('text-[44px] font-extrabold leading-none tracking-tight tabular-nums', NAVY)} aria-live="polite">
          {formatPoints(shown)}
        </p>
        <span className="mb-1.5 text-sm font-medium text-[#64748B]">pts</span>
        <AnimatePresence>
          {lastEarn && (
            <motion.span
              key={lastEarn.id}
              className="mb-2 ml-auto inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
              {formatPoints(lastEarn.points)} earned
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {onTheWay > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#64748B]" data-testid="text-points-on-the-way">
          <Clock className="h-3.5 w-3.5 text-[#F2A123]" />
          <span>
            <span className="font-semibold text-[#B76E00]">+{formatPoints(onTheWay)}</span> on the way, once{' '}
            {pending.length === 1 ? 'your order settles' : `${pending.length} orders settle`}
          </span>
        </p>
      )}

      {canRedeem ? (
        <>
          <p className="mt-1 text-xs text-[#64748B]">
            Worth up to <span className="font-semibold text-emerald-700">{formatInr(pointsDiscount(points))}</span> off
            your payments.
          </p>
          {/* Points are spent where money is: the Review & Pay step and an
              order's Payment due. This sends the customer to the first. */}
          <Link
            href="/create"
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#F2A123] text-sm font-bold text-[#1B2A44] shadow-[0_8px_24px_rgba(242,161,35,0.3)] transition-transform hover:bg-[#F7B03F] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F2A123]/40"
            data-testid="button-use-points"
          >
            <Gift className="h-4 w-4" />
            Use on a booking
          </Link>
          <p className="mt-2 text-center text-[11px] text-[#64748B]">Choose how many at Review &amp; Pay.</p>
        </>
      ) : (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className={cn('font-semibold', NAVY)}>{toUnlock} more until you can use them</span>
            <span className="tabular-nums text-[#64748B]">
              {points}/{REDEEM_MIN_POINTS}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-sm bg-[#F3F4F6]">
            <div
              className="h-full rounded-sm bg-gradient-to-r from-[#F7C35C] to-[#F2A123] motion-safe:transition-[width] motion-safe:duration-700"
              style={{ width: `${(points / REDEEM_MIN_POINTS) * 100}%` }}
            />
          </div>
          <button
            type="button"
            disabled
            className="mt-4 inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-[#F3F4F6] text-sm font-semibold text-[#64748B]"
          >
            <Lock className="h-4 w-4" />
            Use from {REDEEM_MIN_POINTS} points
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Milestone road ─────────────────────────────────────────────────────────

function MilestoneRoad({ progress, className }: { progress: TierProgress; className?: string }) {
  const { current, next } = progress;
  // How far down the rail is lit: whole tiers reached, plus the share of the
  // way into the next one.
  const fill = next ? (current.rank + progress.pct) / (TIERS.length - 1) : 1;

  return (
    <section className={cn('rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_12px_oklch(17%_0.048_248/0.06)] md:p-6', className)} data-testid="rewards-road">
      <h2 className={cn('text-base font-bold tracking-tight', NAVY)}>Your journey</h2>
      <p className="mt-0.5 text-xs text-[#64748B]">Ship more in a year to climb. Billing or weight, whichever gets there first.</p>

      <ol className="relative mt-5">
        {/* Rail, centred on the 48px badges. */}
        <div className="absolute bottom-6 left-6 top-6 w-1 -translate-x-1/2 rounded-full bg-[#E2E8F0]" aria-hidden>
          <div
            className="h-full w-full origin-top rounded-full bg-gradient-to-b from-[#F7C35C] to-[#F2A123] motion-safe:transition-transform motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `scaleY(${fill})` }}
          />
        </div>

        {TIERS.map((tier, i) => {
          const reached = tier.rank <= current.rank;
          const isCurrent = tier.rank === current.rank;
          const isNext = next?.id === tier.id;
          return (
            <motion.li
              key={tier.id}
              className="relative flex items-center gap-4 py-2.5"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
            >
              {/* Solid backing so the rail does not show through a faded, locked badge. */}
              <div className={cn('relative rounded-full bg-white', isCurrent && 'ring-4 ring-[#F2A123]/30 ring-offset-2 ring-offset-white')}>
                <TierEmblem tier={tier} size={48} locked={!reached} />
              </div>
              <div
                className={cn(
                  'min-w-0 flex-1 rounded-md px-3.5 py-2.5',
                  isCurrent ? 'bg-[#F2A123]/10 ring-1 ring-[#F2A123]/40' : isNext ? 'bg-[#F8F9FA] ring-1 ring-[#E2E8F0]' : '',
                )}
              >
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm font-bold', reached ? NAVY : 'text-[#64748B]')}>{tier.name}</p>
                  {isCurrent && (
                    <span className="rounded-sm bg-[#F2A123] px-2 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-[#1B2A44]">
                      You're here
                    </span>
                  )}
                  {reached && !isCurrent && <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} aria-label="Unlocked" />}
                  {tier.placeholder && !reached && (
                    <span className="rounded-sm bg-[#F3F4F6] px-2 py-px text-[10px] font-semibold text-[#64748B]">Provisional</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  {tier.rank === 0 ? 'Where every member starts' : `${formatInrShort(tier.value)} or ${formatKg(tier.weightKg)} in a year`}
                </p>
                {isNext && (
                  <p className="mt-1 text-xs font-semibold text-[#B76E00]">{Math.round(progress.pct * 100)}% there</p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────────

function formatDay(iso: string): string {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'd MMM') : '';
}

function Activity({
  history,
  pending,
  className,
}: {
  history: PointsEntry[];
  pending: PendingEarn[];
  className?: string;
}) {
  const rows = history.slice(0, 6);
  return (
    <section className={cn('rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_12px_oklch(17%_0.048_248/0.06)]', className)} data-testid="rewards-activity">
      <h2 className={cn('text-sm font-semibold', NAVY)}>Points activity</h2>
      {rows.length === 0 && pending.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#64748B]">Your first shipment earns your first points.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#F1F5F9]">
          <AnimatePresence initial={false}>
            {/* Earned on a booking, not yet spendable: the order can still be
                reweighed or cancelled. */}
            {pending.map((row) => (
              <motion.li
                key={`pending-${row.ref}`}
                className="flex items-center gap-3 py-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0 }}
                data-testid="row-points-pending"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-[#F2A123]/60 text-[#B76E00]">
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium', NAVY)}>On the way</p>
                  <p className="text-xs text-[#64748B]">{row.ref} · once the order settles</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-[#B76E00]">+{formatPoints(row.points)}</span>
              </motion.li>
            ))}
            {rows.map((row) => (
              <motion.li
                key={row.id}
                className="flex items-center gap-3 py-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0 }}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                    row.kind === 'redeem' ? 'bg-[#2F4468]/10 text-[#2F4468]' : 'bg-[#F2A123]/12 text-[#B76E00]',
                  )}
                >
                  {row.kind === 'earn' ? (
                    <Package className="h-4 w-4" />
                  ) : row.kind === 'refund' ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <Gift className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium', NAVY)}>{row.label}</p>
                  <p className="text-xs text-[#64748B]">
                    {row.ref ? `${row.ref} · ` : ''}
                    {formatDay(row.date)}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-sm font-bold tabular-nums',
                    row.points > 0 ? 'text-emerald-700' : 'text-[#64748B]',
                  )}
                >
                  {row.points > 0 ? '+' : '−'}
                  {formatPoints(Math.abs(row.points))}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

// ─── How it works ───────────────────────────────────────────────────────────

const STEPS = [
  { icon: Package, title: 'Ship', body: `Every ₹${RUPEES_PER_POINT} you're billed earns 1 point. GST isn't counted.` },
  { icon: TrendingUp, title: 'Climb', body: "Hit a tier's yearly billing or weight target, whichever comes first." },
  { icon: Gift, title: 'Use', body: `From ${REDEEM_MIN_POINTS} points, take them off any payment at Review & Pay.` },
] as const;

function HowItWorks({ className }: { className?: string }) {
  return (
    <section className={cn('rounded-lg bg-[#F3F4F6] p-5', className)} data-testid="rewards-how">
      <h2 className={cn('text-sm font-semibold', NAVY)}>How it works</h2>
      <ol className="mt-3 space-y-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-[#2F4468] shadow-sm">
              {i + 1}
            </span>
            <div>
              <p className={cn('text-sm font-semibold', NAVY)}>{step.title}</p>
              <p className="text-xs leading-relaxed text-[#64748B]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-relaxed text-[#64748B]">
        For customers who book directly with Bombino. Yearly totals run April to March.
      </p>
    </section>
  );
}

// ─── Demo controls ──────────────────────────────────────────────────────────

/**
 * Walkthrough controls for the demo build. These are not part of the
 * customer-facing design and should be removed once rewards reads from the API.
 */
function DemoControls({ className }: { className?: string }) {
  const scenarioId = useRewardsStore((s) => s.scenarioId);
  const setScenario = useRewardsStore((s) => s.setScenario);
  const simulateShipment = useRewardsStore((s) => s.simulateShipment);
  const tourRunning = useRewardsTour((s) => s.running);
  const { toast } = useToast();

  // On a phone the wallet is a long scroll above this panel, so the earn is
  // confirmed here too.
  const simulate = (): void => {
    simulateShipment();
    const { lastEarn, member } = useRewardsStore.getState();
    if (lastEarn) {
      toast({
        title: `+${formatPoints(lastEarn.points)} points`,
        description: `${member.history[0]?.ref ?? 'Shipment'} · balance ${formatPoints(member.points)}`,
      });
    }
  };

  return (
    <section className={cn('rounded-lg border-2 border-dashed border-[#CBD5E1] p-5', className)} data-testid="rewards-demo">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748B]">
        <Sparkles className="h-3.5 w-3.5" />
        Demo controls
      </p>
      <p className="mt-1 text-xs text-[#64748B]">For walkthroughs only. Customers won't see this.</p>

      {/* The whole story, hands-free: books a dummy shipment, spends points on
          it and puts the figures back after (lib/rewardsTour). */}
      <button
        type="button"
        onClick={startRewardsTour}
        disabled={tourRunning}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#2F4468] text-sm font-bold text-white transition-colors hover:bg-[#24375A] disabled:opacity-60"
        data-testid="button-play-rewards-demo"
      >
        <PlayCircle className="h-4 w-4 text-[#F7C35C]" />
        Play the rewards demo
      </button>
      <p className="mt-1.5 text-center text-[11px] text-[#64748B]">
        About 2 minutes. Books a dummy shipment and uses points on it.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Member preview">
        {DEMO_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scenarioId === s.id}
            onClick={() => setScenario(s.id)}
            className={cn(
              'h-9 rounded-md border px-3.5 text-xs font-semibold transition-colors',
              scenarioId === s.id
                ? 'border-[#2F4468] bg-[#2F4468] text-white'
                : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#2F4468]/40',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={simulate}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#2F4468] text-sm font-semibold text-[#2F4468] transition-colors hover:bg-[#2F4468] hover:text-white"
        data-testid="button-simulate-shipment"
      >
        <Plus className="h-4 w-4" />
        Simulate a shipment
      </button>
    </section>
  );
}
