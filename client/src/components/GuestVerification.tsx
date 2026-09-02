import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';

const RESEND_COOLDOWN_SECONDS = 30;

interface GuestVerificationProps {
  /**
   * The verified number, or null while it is not. The parent sends this as the
   * sender phone, so the number that authorised the booking and the number on
   * the order are the same by construction.
   */
  onVerifiedPhoneChange: (phone: string | null) => void;
  /**
   * Called when a verified number is given up — changed, or its OTP expired.
   * Whatever was staged belonged to that number, so the parent drops its view
   * of the documents too rather than showing ticks for rows that are gone.
   */
  onReset: () => void;
}

/**
 * The first half of what a guest has to prove: the phone number.
 *
 * First on the Sender step, because everything else on the booking depends on
 * it. The staging endpoints that take their documents are authorised by this
 * OTP rather than by a session, so nothing can be uploaded until it passes,
 * and the number proved here is written into the sender field below — typed
 * once, not twice.
 *
 * The documents themselves are asked for further down the step, after the
 * address, by `AccountDocuments` in its `signup` mode. Kept apart deliberately:
 * this card is short and always answerable, while the document form is long
 * and needs the address settled first. Booking without an account is still not
 * booking without KYC — the server refuses a guest order until both halves are
 * done.
 */
export function GuestVerification({
  onVerifiedPhoneChange,
  onReset,
}: GuestVerificationProps): React.JSX.Element {
  // Nothing to prefill from: this card is the first thing on the step, which
  // is the point — the number proved here is the one written into the sender
  // field below, rather than a second number typed there and reconciled after.
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'documents'>('phone');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The parent gates Continue on this, and treats an unverified guest as
  // having every document outstanding — there is nowhere to stage them yet.
  useEffect(() => {
    onVerifiedPhoneChange(verifiedPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifiedPhone]);

  const requestOtp = async (): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      await apiRequest('POST', '/api/auth/otp/request', { phone: phone.trim(), purpose: 'auth' });
      setStep('otp');
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(parseApiErrorMessage(err, 'Could not send code'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = (): void => {
    if (!/^\d{10}$/.test(phone.trim())) {
      setError('Enter a valid 10-digit phone number');
      phoneRef.current?.focus();
      return;
    }
    void requestOtp();
  };

  const submitOtp = async (code: string): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      // The same endpoint the login screen uses. A number that turns out to
      // have an account still answers `signed_in` there; here we only need the
      // verification itself, which either answer leaves behind.
      await apiRequest('POST', '/api/auth/phone/continue', { phone: phone.trim(), code });
      setVerifiedPhone(phone.trim());
      setStep('documents');
    } catch (err) {
      setError(parseApiErrorMessage(err, 'Incorrect code'));
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Change the number after it has been verified.
   *
   * Everything staged belongs to the old one — the server discards it when the
   * phone changes, and `AccountDocuments` re-reads on the new ref — so this
   * drops the local view of it too rather than leaving ticks on screen for
   * documents that are no longer there.
   */
  const handleEditPhone = (): void => {
    setVerifiedPhone(null);
    setOtp('');
    setError('');
    setStep('phone');
    onReset();
  };

  return (
    <div
      className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-4"
      data-testid="guest-verification"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2A123]/12">
          <ShieldCheck className="h-4 w-4 text-[#F2A123]" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[lab(34.0831_-9.57756_-27.7093)]">
            Verify it&rsquo;s you
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            We&rsquo;ll send a 6-digit code. Indian customs needs an identity
            document for every shipment, so we ask for the same details whether
            or not you open an account.
          </p>
        </div>
      </div>

      {step === 'phone' && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Mobile number *</Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-11 shrink-0 items-center rounded-xl border border-[#E2E8F0] bg-[#F3F4F6] px-3 text-sm font-medium text-muted-foreground">
                +91
              </span>
              <Input
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendOtp();
                  }
                }}
                placeholder="10-digit number"
                className="h-11 rounded-xl"
                data-testid="input-guest-phone"
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={handleSendOtp}
            disabled={isLoading || phone.trim().length !== 10}
            className="h-11 w-full rounded-xl bg-[lab(34.0831_-9.57756_-27.7093)] text-sm font-semibold text-[#F8F9FA] hover:opacity-90 disabled:opacity-60"
            data-testid="button-guest-send-otp"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}
          </Button>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Enter the code sent to +91 {phone}
            </Label>
            <div className="mt-2 flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                autoFocus
                onChange={(v) => {
                  setOtp(v);
                  setError('');
                  // Submit on the last digit, as the login screen does — the
                  // extra tap is ceremony once the code is complete.
                  if (v.length === 6 && !isLoading) void submitOtp(v);
                }}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-12 w-11 text-base"
                      data-testid={`input-guest-otp-slot-${i}`}
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleEditPhone}
              className="text-xs font-semibold text-[#64748B] underline underline-offset-4"
              data-testid="button-guest-change-phone"
            >
              Change number
            </button>
            <button
              type="button"
              onClick={() => cooldown === 0 && void requestOtp()}
              disabled={cooldown > 0 || isLoading}
              className="text-xs font-semibold text-[#2F4468] underline underline-offset-4 disabled:text-muted-foreground disabled:no-underline"
              data-testid="button-guest-resend-otp"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {step === 'documents' && verifiedPhone && (
        <div className="flex items-center justify-between rounded-lg bg-[#F3F4F6] px-3 py-2">
          <span className="text-xs text-[lab(34.0831_-9.57756_-27.7093)]">
            <span className="font-semibold">+91 {verifiedPhone}</span> verified
          </span>
          <button
            type="button"
            onClick={handleEditPhone}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F4468] underline underline-offset-4"
            data-testid="button-guest-edit-verified-phone"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            Change
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600" role="alert" data-testid="text-guest-verification-error">
          {error}
        </p>
      )}
    </div>
  );
}
