import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { type AgentPickup } from '@/hooks/useAgentPickups';

/**
 * The customer's six-digit code, typed in at the door.
 *
 * The agent cannot see this number anywhere in their app — that is the point.
 * It is on the customer's screen, read out loud, and typing it is the proof
 * that the agent was actually standing in front of the person who booked.
 *
 * Same square-cornered, no-handle treatment as the payment sheet: a form to be
 * filled and confirmed, not a panel to flick away. Digits are set large and
 * mono because they are entered on a doorstep, one-handed, often in sunlight.
 *
 * The server owns every rule about the code — how many attempts remain, whether
 * it is locked. This shows what the server said and does not second-guess it;
 * an attempts counter maintained on the phone would be wrong the moment two
 * devices tried.
 */

const OTP_LENGTH = 6;

export function HandoverOtpSheet({
  open,
  onOpenChange,
  pickup,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pickup: AgentPickup;
  onConfirm: (payload: { otp: string }) => void;
  isPending: boolean;
  /** Server's verdict on the last attempt — wrong code, locked, no code. */
  error: string | null;
}) {
  const [otp, setOtp] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear on open so a previous door's digits cannot be submitted at this one.
  useEffect(() => {
    if (open) {
      setOtp('');
      // Deferred a frame: the sheet animates in, and focusing mid-transition
      // leaves the keyboard covering a half-drawn sheet on Android.
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  const complete = otp.length === OTP_LENGTH;

  const submit = (): void => {
    if (!complete || isPending) return;
    onConfirm({ otp });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'rounded-none border-t-2 border-[#1B2A41] p-0 [&>button]:hidden',
          'max-h-[92dvh] overflow-y-auto',
        )}
        data-testid="sheet-handover-otp"
      >
        <div className="px-4 pt-5 pb-4 border-b border-[#E2E8F0]!">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748B]">
            {pickup.order_no}
          </span>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em] leading-[1.15] text-[#1B2A41] mt-1.5">
            Ask for the pickup code
          </h2>
          <p className="text-[14px] font-medium leading-[1.45] text-[#334155] mt-1.5">
            {pickup.origin_address?.full_name ?? 'The sender'} has a 6-digit code in the Bombino
            app. Type it in to confirm you collected the parcel from them.
          </p>
        </div>

        <div className="px-4 py-5">
          <input
            ref={inputRef}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="——————"
            aria-label="Pickup code"
            className={cn(
              'w-full h-16 text-center font-mono text-[32px] font-bold tracking-[0.3em]',
              'border-2 bg-white text-[#1B2A41] placeholder:text-[#CBD5E1] outline-none',
              error ? 'border-[#B91C1C]' : 'border-[#CBD5E1] focus:border-[#1B2A41]',
            )}
            data-testid="input-handover-otp"
          />

          {error ? (
            <p
              className="mt-2.5 text-[13px] font-semibold leading-[1.4] text-[#B91C1C]"
              data-testid="error-handover-otp"
            >
              {error}
            </p>
          ) : (
            <p className="mt-2.5 flex items-start gap-1.5 text-[12px] font-medium leading-[1.4] text-[#64748B]">
              <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={2} />
              If the customer cannot find their code, they can generate a new one from the order
              screen. Call the office if their phone is dead.
            </p>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="h-14 min-w-[104px] px-3 border border-[#CBD5E1]! bg-white text-[15px] font-semibold text-[#1B2A41] disabled:opacity-60"
            data-testid="button-otp-cancel"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!complete || isPending}
            className="h-14 flex-1 flex items-center justify-center bg-[#1B2A41] text-[15px] font-bold text-white disabled:opacity-60"
            data-testid="button-otp-confirm"
          >
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm pickup'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
