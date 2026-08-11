import { useEffect, useState } from 'react';
import { Smartphone, Banknote, Loader2, Check, Copy } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { type AgentPickup } from '@/hooks/useAgentPickups';

/**
 * Money handling, in a bottom sheet over the job it belongs to.
 *
 * Two states, never both: choose-and-confirm, then receipt. The receipt is not
 * a toast — a transaction id the customer may ask to see cannot vanish after
 * four seconds, so it holds the sheet until the agent dismisses it.
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
        className="rounded-t-[20px] border-t-0 px-5 pb-8 pt-3 max-h-[92dvh] overflow-y-auto"
        data-testid="sheet-collect-payment"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-border mb-5" aria-hidden />

        {receipt ? (
          // ── Receipt ──────────────────────────────────────────────────────
          <div className="text-center" data-testid="payment-receipt">
            <div className="w-14 h-14 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-700 stroke-[3]" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Collected
            </p>
            <p className="text-5xl font-extrabold tracking-tight text-foreground tabular-nums mt-1">
              ₹{receipt.amount}
            </p>

            <button
              type="button"
              onClick={copyTxn}
              className="mt-5 w-full rounded-xl bg-muted/60 border border-border px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
              data-testid="button-copy-txn"
            >
              <span className="text-left">
                <span className="block text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                  Transaction ID
                </span>
                <span className="block font-mono text-base font-bold text-foreground mt-0.5">
                  {receipt.txnId ?? 'Not issued'}
                </span>
              </span>
              <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              Read this to the customer if they ask for proof.
            </p>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-5 w-full h-14 rounded-xl bg-primary text-white text-base font-bold active:scale-[0.98] transition-transform"
              data-testid="button-receipt-done"
            >
              Done
            </button>
          </div>
        ) : (
          // ── Collect ──────────────────────────────────────────────────────
          <>
            <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Collect for {pickup.order_no}
            </p>
            <p className="text-4xl font-extrabold tracking-tight text-foreground tabular-nums mt-1 mb-5">
              ₹{due || '—'}
            </p>

            <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-2">
              How did you take it?
            </p>
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {(
                [
                  { key: 'upi' as const, icon: Smartphone, label: 'UPI / Online', hint: 'Transfer' },
                  { key: 'cash' as const, icon: Banknote, label: 'Cash', hint: 'In hand' },
                ]
              ).map(({ key, icon: Icon, label, hint }) => {
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
                      'h-[92px] rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-[0.98]',
                      selected
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-foreground',
                    )}
                    data-testid={`button-mode-${key}`}
                  >
                    <Icon className={cn('w-6 h-6', selected && 'stroke-[2.5]')} />
                    <span className="text-sm font-bold leading-none">{label}</span>
                    <span
                      className={cn(
                        'text-[10px] leading-none',
                        selected ? 'text-white/70' : 'text-muted-foreground',
                      )}
                    >
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <label
              htmlFor="collect-amount"
              className="block text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-2"
            >
              Amount taken
            </label>
            <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-white px-4 h-14 mb-3 focus-within:border-primary transition-colors">
              <span className="text-xl font-bold text-muted-foreground">₹</span>
              <input
                id="collect-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError('');
                }}
                placeholder="0"
                className="flex-1 min-w-0 bg-transparent outline-none text-2xl font-extrabold tabular-nums text-foreground"
                data-testid="input-collect-amount"
              />
              {Number(amount) !== due && due > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(due))}
                  className="text-[11px] font-bold text-primary shrink-0"
                  data-testid="button-reset-amount"
                >
                  ₹{due}
                </button>
              )}
            </div>

            {/* No QR, by product decision: the agent never puts a payee
                address in front of the customer. The transfer is arranged
                between them and only its reference is recorded here. */}
            {mode === 'upi' && (
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="UPI reference (optional)"
                className="w-full rounded-xl border-2 border-border bg-white px-4 h-12 outline-none text-sm font-medium focus:border-primary transition-colors mb-3"
                data-testid="input-upi-reference"
              />
            )}

            {error && (
              <p className="text-sm font-semibold text-red-600 mb-3" data-testid="error-collect">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="w-full h-14 rounded-xl bg-primary text-white text-base font-bold active:scale-[0.98] transition-transform disabled:opacity-60 grid place-items-center"
              data-testid="button-confirm-collect"
            >
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm collection'}
            </button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
