import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Gift } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { REDEEM_MIN_POINTS, formatPoints } from '@/lib/rewards';

interface RedeemSheetProps {
  open: boolean;
  balance: number;
  onOpenChange: (open: boolean) => void;
  onRedeem: (points: number) => void;
}

const STEP = 10;

/**
 * Redeem flow: pick an amount, confirm, see it done.
 *
 * What a redeemed point is worth, and where it lands, is still open with
 * Bombino (open questions 1 and 7 in docs/rewards/rewards-logic.md). So the
 * sheet deals only in points and says they come off the next booking. It
 * never shows a rupee value.
 */
export function RedeemSheet({ open, balance, onOpenChange, onRedeem }: RedeemSheetProps) {
  const [amount, setAmount] = useState(REDEEM_MIN_POINTS);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(Math.min(Math.max(REDEEM_MIN_POINTS, Math.floor(balance / 2 / STEP) * STEP), balance));
      setDone(null);
    }
    // Reset only when the sheet opens, not each time the balance changes under it.
  }, [open]);

  const chips = [
    ...[REDEEM_MIN_POINTS, 500, 1000]
      .filter((p) => p < balance)
      .map((p) => ({ key: String(p), label: formatPoints(p), value: p })),
    { key: 'all', label: 'All', value: balance },
  ];

  const confirm = (): void => {
    onRedeem(amount);
    setDone(amount);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-lg border-[#E2E8F0] bg-white px-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2"
      >
        {done === null ? (
          <div className="px-5 pt-4">
            <SheetTitle className="text-lg font-bold tracking-tight text-[lab(34.0831_-9.57756_-27.7093)]">
              Redeem points
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-[#64748B]">
              You have <span className="font-semibold text-[lab(34.0831_-9.57756_-27.7093)]">{formatPoints(balance)}</span> points.
              They'll come off your next booking.
            </SheetDescription>

            <div className="mt-6 text-center">
              <p className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums text-[lab(34.0831_-9.57756_-27.7093)]">
                {formatPoints(amount)}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]">points to redeem</p>
            </div>

            <input
              type="range"
              className="mt-6 h-2 w-full cursor-pointer appearance-none rounded-sm bg-[#F3F4F6] accent-[#F2A123]"
              min={REDEEM_MIN_POINTS}
              max={balance}
              step={STEP}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Points to redeem"
            />
            <div className="mt-2 flex justify-between text-[11px] tabular-nums text-[#64748B]">
              <span>{formatPoints(REDEEM_MIN_POINTS)} min</span>
              <span>{formatPoints(balance)}</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setAmount(chip.value)}
                  aria-pressed={amount === chip.value}
                  className={cn(
                    'h-10 min-w-[4.5rem] rounded-md border px-4 text-sm font-semibold tabular-nums transition-colors',
                    amount === chip.value
                      ? 'border-[#F2A123] bg-[#F2A123]/12 text-[#7A4B00]'
                      : 'border-[#E2E8F0] text-[#334155] hover:border-[#F2A123]/50',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={confirm}
              className="mt-6 h-12 w-full rounded-md bg-[#F2A123] text-sm font-bold text-[#1B2A44] shadow-[0_8px_24px_rgba(242,161,35,0.3)] transition-transform hover:bg-[#F7B03F] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F2A123]/40"
              data-testid="button-confirm-redeem"
            >
              Redeem {formatPoints(amount)} points
            </button>
          </div>
        ) : (
          <div className="px-5 pb-2 pt-8 text-center">
            <motion.div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-[#F2A123]"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            >
              <Check className="h-8 w-8 text-[#1B2A44]" strokeWidth={3} />
            </motion.div>
            <SheetTitle className="mt-5 text-xl font-bold tracking-tight text-[lab(34.0831_-9.57756_-27.7093)]">
              {formatPoints(done)} points redeemed
            </SheetTitle>
            <SheetDescription className="mx-auto mt-2 max-w-[18rem] text-sm text-[#64748B]">
              We'll take them off your next booking. You have {formatPoints(balance)} points left.
            </SheetDescription>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[#E2E8F0] text-sm font-semibold text-[lab(34.0831_-9.57756_-27.7093)] transition-colors hover:bg-[#F3F4F6]"
            >
              <Gift className="h-4 w-4" />
              Back to rewards
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
