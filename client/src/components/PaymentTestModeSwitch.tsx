import { FlaskConical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { usePaymentsConfig, useTestModeSkip } from '@/lib/paymentsTestMode';

/**
 * TEMPORARY — the pay-now test switch.
 *
 * Renders nothing at all unless the server reports `test_mode`, so it cannot
 * appear in front of a real customer by accident: the only way to show it is to
 * set `PAYMENTS_TEST_MODE=1` on that environment.
 *
 * Deliberately ugly. A dashed amber panel and a lab flask, sitting outside the
 * product's visual language, because a control that marks orders paid without
 * charging anyone must never be mistaken for a feature. It is also why the copy
 * states the consequence ("marked paid — no money moves") rather than naming the
 * gateway and leaving the reader to infer it.
 *
 * Delete with `lib/paymentsTestMode.ts` and the server's `/test/settle`.
 */
export function PaymentTestModeSwitch({ className }: { className?: string }) {
  const { data: config } = usePaymentsConfig();
  const [skip, setSkip] = useTestModeSkip();

  if (!config?.test_mode) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-dashed border-[#F2A123] bg-[#F2A123]/10 px-3 py-2.5',
        className,
      )}
      data-testid="payment-test-mode"
    >
      <FlaskConical className="w-4 h-4 shrink-0 mt-0.5 text-[#8a5a06]" strokeWidth={2.5} />

      <label htmlFor="payments-test-mode" className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-xs font-bold uppercase tracking-[0.1em] text-[#8a5a06]">
          Testing · skip Razorpay
        </span>
        <span className="block text-[11px] leading-relaxed text-[#8a5a06]/85 mt-0.5">
          {skip
            ? 'On — the order will be marked paid and no money moves.'
            : 'Off — the order goes through Razorpay checkout as normal.'}
        </span>
      </label>

      <Switch
        id="payments-test-mode"
        checked={skip}
        onCheckedChange={setSkip}
        className="mt-0.5 shrink-0 data-[state=checked]:bg-[#8a5a06]"
        data-testid="switch-payment-test-mode"
      />
    </div>
  );
}
