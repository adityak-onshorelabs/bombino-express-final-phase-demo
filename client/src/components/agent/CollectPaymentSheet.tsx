import { useEffect, useState } from 'react';
import { Smartphone, CreditCard, Loader2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { money } from '@/components/agent/PickupCard';
import { type AgentPickup } from '@/hooks/useAgentPickups';

/**
 * Money handling, in a bottom sheet over the job it belongs to.
 *
 * Two states, never both: choose-and-confirm, then the amount taken. The order
 * number sits at the top of both, because the agent reads it out while taking
 * the cash.
 *
 * Square top corners and no drag handle: this is a form that has to be filled
 * and confirmed, not a panel to be flicked away with a thumb.
 *
 * Everything here is oversized on purpose — 70px fields, a 31px amount, 20px
 * button labels. It is the one screen an agent fills in while standing at a
 * door holding a parcel, often one-handed, and a mis-tap here costs real money.
 *
 * Mode is a required, explicit choice with no default. An agent who taps
 * through without reading would otherwise record cash they are not carrying,
 * and the pouch would not reconcile at the end of the shift.
 *
 * The UPI reference input and the transaction id are gone, on the assumption an
 * agent never reads either aloud. The server still issues and stores the id —
 * this only stops showing it. If ops asks agents for a txn id by phone, it goes
 * back on the Money row as a third line. See the handoff's open items.
 */

type Mode = 'upi' | 'cash';

/** `CASH OR UPI?` · `HOW MUCH?` — the sheet's two section labels. */
const SECTION_LABEL = 'text-xs font-bold uppercase tracking-[0.14em] text-[#64748B] mt-[22px] mb-3';

export function CollectPaymentSheet({
  open,
  onOpenChange,
  pickup,
  onConfirm,
  isPending,
  receipt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pickup: AgentPickup;
  onConfirm: (payload: { amount: number; collection_mode: Mode }) => void;
  isPending: boolean;
  /** Set by the parent once the server issues one; flips the sheet to the total. */
  receipt: { txnId: string | null; amount: number } | null;
}) {
  const due = pickup.quoted_amount ?? 0;
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState(String(due || ''));
  const [error, setError] = useState('');

  // Reset whenever the sheet reopens, so a previous job's amount cannot carry
  // over into the next doorstep.
  useEffect(() => {
    if (open && !receipt) {
      setMode(null);
      setAmount(String(due || ''));
      setError('');
    }
  }, [open, receipt, due]);

  const submit = (): void => {
    if (!mode) {
      setError('Cash or UPI?');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('How much?');
      return;
    }
    setError('');
    onConfirm({ amount: value, collection_mode: mode });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'agent-surface rounded-none border-t-0 bg-white px-5 pt-5 pb-[26px] max-h-[92dvh] overflow-y-auto',
          'shadow-[0_-12px_40px_rgba(15,22,32,0.28)]',
          // The shared Sheet primitive stamps a close X at top-right, where the
          // header sits on this design. Hidden here rather than changed there —
          // the customer app's sheets still want it — and the sheet still
          // closes on the overlay, on Esc, and on Done.
          '[&>button:first-child]:hidden',
        )}
        data-testid="sheet-collect-payment"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#1B2A41]! pb-3.5">
          <span className="text-[21px] font-bold tracking-[0.02em] text-[#1B2A41]">
            {pickup.order_no}
          </span>
          <span className="shrink-0 text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
            Take money
          </span>
        </div>

        {receipt ? (
          // ── Taken ────────────────────────────────────────────────────────
          <div data-testid="payment-receipt">
            <p className="text-[50px] font-bold leading-none tracking-[-0.02em] text-[#1B2A41] mt-6">
              ₹{money(receipt.amount)}
            </p>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-6 w-full h-[60px] bg-[#1B2A41] text-xl font-bold text-white active:scale-[0.98] transition-transform"
              data-testid="button-receipt-done"
            >
              Done
            </button>
          </div>
        ) : (
          // ── Take ─────────────────────────────────────────────────────────
          <>
            <p className={SECTION_LABEL}>Cash or UPI?</p>
            <div className="flex gap-2.5">
              {(
                [
                  { key: 'upi' as const, icon: Smartphone, label: 'UPI' },
                  { key: 'cash' as const, icon: CreditCard, label: 'Cash' },
                ]
              ).map(({ key, icon: Icon, label }) => {
                const selected = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMode(key);
                      if (error) setError('');
                    }}
                    aria-pressed={selected}
                    className={cn(
                      'flex-1 h-[70px] flex items-center justify-center gap-[11px] transition-colors duration-150 active:scale-[0.98]',
                      selected ? 'bg-[#1B2A41]' : 'bg-white border border-[#CBD5E1]!',
                    )}
                    data-testid={`button-mode-${key}`}
                  >
                    <Icon
                      className={cn(
                        'w-[22px] h-[22px]',
                        selected ? 'text-[#F2A123]' : 'text-[#1B2A41]',
                      )}
                      strokeWidth={1.5}
                    />
                    <span
                      className={cn(
                        'text-xl font-bold',
                        selected ? 'text-white' : 'text-[#1B2A41]',
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <label htmlFor="collect-amount" className={cn('block', SECTION_LABEL)}>
              How much?
            </label>
            <div className="h-[70px] border border-[#1B2A41]! flex items-center gap-2.5 px-[18px]">
              <span className="text-2xl font-semibold text-[#64748B]">₹</span>
              <input
                id="collect-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError('');
                }}
                placeholder="0"
                className="flex-1 min-w-0 bg-transparent outline-none text-[31px] font-bold tracking-[-0.01em] text-[#1B2A41]"
                data-testid="input-collect-amount"
              />
              {Number(amount) !== due && due > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(due))}
                  className="shrink-0 text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]"
                  data-testid="button-reset-amount"
                >
                  Full
                </button>
              )}
            </div>

            {error && (
              <p className="text-[15px] font-bold text-[#B91C1C] mt-3" data-testid="error-collect">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="mt-5 w-full h-[60px] bg-[#F2A123] text-xl font-bold text-[#1B2A41] grid place-items-center active:scale-[0.98] transition-transform disabled:opacity-60"
              data-testid="button-confirm-collect"
            >
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Money taken'}
            </button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
