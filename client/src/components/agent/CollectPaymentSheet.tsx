import { useEffect, useState } from 'react';
import { Smartphone, Banknote, Loader2, Copy } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { money } from '@/components/agent/PickupCard';
import { type AgentPickup } from '@/hooks/useAgentPickups';

/**
 * Money handling, in a bottom sheet over the job it belongs to.
 *
 * Two states, never both: choose-and-confirm, then receipt. The receipt is not
 * a toast — a transaction id the customer may ask to see cannot vanish after
 * four seconds, so it holds the sheet until the agent dismisses it.
 *
 * Square top corners and no drag handle: this is a form that has to be filled
 * and confirmed, not a panel to be flicked away with a thumb. It is a document
 * being written, which is also why the receipt has no celebration — the emerald
 * circle-check is gone.
 *
 * Mode is a required, explicit choice with no default. An agent who taps
 * through without reading would otherwise record cash they are not carrying,
 * and the pouch would not reconcile at the end of the shift.
 */

type Mode = 'upi' | 'cash';

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
  onConfirm: (payload: { amount: number; collection_mode: Mode; reference?: string }) => void;
  isPending: boolean;
  /** Set by the parent once the server issues one; flips the sheet to receipt. */
  receipt: { txnId: string | null; amount: number } | null;
}) {
  const due = pickup.quoted_amount ?? 0;
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState(String(due || ''));
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const { toast } = useToast();

  // Reset whenever the sheet reopens, so a previous job's amount cannot carry
  // over into the next doorstep.
  useEffect(() => {
    if (open && !receipt) {
      setMode(null);
      setAmount(String(due || ''));
      setReference('');
      setError('');
    }
  }, [open, receipt, due]);

  const submit = (): void => {
    if (!mode) {
      setError('Choose how you took the money');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter the amount you collected');
      return;
    }
    setError('');
    onConfirm({
      amount: value,
      collection_mode: mode,
      ...(mode === 'upi' && reference.trim() ? { reference: reference.trim() } : {}),
    });
  };

  const copyTxn = (): void => {
    if (!receipt?.txnId) return;
    void navigator.clipboard.writeText(receipt.txnId);
    toast({ title: 'Copied', description: 'Transaction ID copied' });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'rounded-none border-t-0 bg-white px-4 pt-4 pb-[22px] max-h-[92dvh] overflow-y-auto',
          'shadow-[0_-12px_40px_rgba(15,22,32,0.28)]',
          // The shared Sheet primitive stamps a close X at top-right, where the
          // amount due sits on this design. Hidden here rather than changed
          // there — the customer app's sheets still want it — and the sheet
          // still closes on the overlay, on Esc, and on Done.
          '[&>button:first-child]:hidden',
        )}
        data-testid="sheet-collect-payment"
      >
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#1B2A41]! pb-2.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B2A41]">
            {receipt ? 'Collected' : 'Collect'} · {pickup.order_no}
          </span>
          <span className="font-mono text-[11px] font-medium uppercase text-[#64748B] tabular-nums shrink-0">
            {receipt ? 'Receipt' : `DUE ₹${money(due)}`}
          </span>
        </div>

        {receipt ? (
          // ── Receipt ──────────────────────────────────────────────────────
          <div data-testid="payment-receipt">
            <p className="font-mono text-[44px] font-bold leading-none tracking-[-0.02em] text-[#1B2A41] tabular-nums mt-4">
              ₹{money(receipt.amount)}
            </p>

            <button
              type="button"
              onClick={copyTxn}
              className="mt-4 w-full border border-[#E2E8F0]! px-4 py-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform"
              data-testid="button-copy-txn"
            >
              <span>
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
                  Transaction ID
                </span>
                <span className="block font-mono text-[15px] font-bold text-[#1B2A41] mt-1">
                  {receipt.txnId ?? 'Not issued'}
                </span>
              </span>
              <Copy className="w-4 h-4 shrink-0 text-[#64748B]" />
            </button>

            <p className="text-[12.5px] font-medium leading-[1.5] text-[#64748B] mt-2.5">
              Read this to the customer if they ask for proof.
            </p>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-4 w-full h-14 bg-[#1B2A41] text-base font-bold text-white active:scale-[0.98] transition-transform"
              data-testid="button-receipt-done"
            >
              Done
            </button>
          </div>
        ) : (
          // ── Collect ──────────────────────────────────────────────────────
          <>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B] mt-4 mb-2">
              How did you take it?
            </p>
            <div className="flex gap-2">
              {(
                [
                  { key: 'upi' as const, icon: Smartphone, label: 'UPI' },
                  { key: 'cash' as const, icon: Banknote, label: 'Cash' },
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
                      'flex-1 h-16 flex items-center justify-center gap-[9px] transition-colors duration-150 active:scale-[0.98]',
                      selected ? 'bg-[#1B2A41]' : 'bg-white border border-[#CBD5E1]!',
                    )}
                    data-testid={`button-mode-${key}`}
                  >
                    <Icon
                      className={cn(
                        'w-[19px] h-[19px]',
                        selected ? 'text-[#F2A123]' : 'text-[#1B2A41]',
                      )}
                      strokeWidth={2}
                    />
                    <span
                      className={cn(
                        'text-base font-bold',
                        selected ? 'text-white' : 'text-[#1B2A41]',
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <label
              htmlFor="collect-amount"
              className="block font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B] mt-4 mb-2"
            >
              Amount taken
            </label>
            <div className="h-16 border border-[#1B2A41]! flex items-center gap-2 px-4">
              <span className="font-mono text-[22px] font-semibold text-[#64748B]">₹</span>
              <input
                id="collect-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError('');
                }}
                placeholder="0"
                className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[28px] font-bold tracking-[-0.01em] text-[#1B2A41] tabular-nums"
                data-testid="input-collect-amount"
              />
              {Number(amount) !== due && due > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(due))}
                  className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]"
                  data-testid="button-reset-amount"
                >
                  Full amount
                </button>
              )}
            </div>

            {/* No QR, by product decision: the agent never puts a payee address
                in front of the customer. The transfer is arranged between them
                and only its reference is recorded here. Shares the amount
                field's bottom edge — one field, two lines. */}
            {mode === 'upi' && (
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="UPI reference (optional)"
                className="w-full h-[52px] border border-[#E2E8F0]! border-t-0 px-4 outline-none font-mono text-xs font-medium text-[#1B2A41] focus:border-[#1B2A41]! transition-colors"
                data-testid="input-upi-reference"
              />
            )}

            {error && (
              <p className="text-[13px] font-semibold text-[#B91C1C] mt-2.5" data-testid="error-collect">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="mt-3.5 w-full h-14 bg-[#F2A123] text-base font-bold text-[#1B2A41] grid place-items-center active:scale-[0.98] transition-transform disabled:opacity-60"
              data-testid="button-confirm-collect"
            >
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm collection'}
            </button>

            <p className="text-[12.5px] font-medium leading-[1.5] text-[#64748B] text-center mt-2.5">
              The transaction ID appears here and stays until you close it.
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
