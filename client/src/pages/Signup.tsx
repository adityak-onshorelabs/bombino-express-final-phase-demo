import { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Phone, Building2, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { KycUpload, type KycUploadResult } from '@/components/KycUpload';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';
import { validateGstin } from '@shared/gstin';
import { cn } from '@/lib/utils';
import bombinoLogo from '@/assets/bombino-logo.png';

const RESEND_COOLDOWN_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccountType = 'personal' | 'company';
type Step = 'details' | 'otp' | 'kyc' | 'preview';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const { toast } = useToast();

  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [step, setStep] = useState<Step>('details');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Personal
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [kycResult, setKycResult] = useState<KycUploadResult | null>(null);

  // Company
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');

  // Shared
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  const redirect = new URLSearchParams(window.location.search).get('redirect');
  const purpose = accountType === 'personal' ? 'signup_personal' : 'signup_company';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const switchAccountType = (next: AccountType): void => {
    setAccountType(next);
    setStep('details');
    setErrors({});
    setOtp('');
    setCooldown(0);
  };

  const requestOtp = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/otp/request', { phone, purpose });
      setStep('otp');
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast({ title: 'OTP sent', description: `Sent to ${phone}` });
    } catch (err) {
      setErrors({ form: parseApiErrorMessage(err, 'Could not send OTP') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtpPersonal = (): void => {
    const nextErrors: Record<string, string> = {};
    if (!fullName.trim()) nextErrors.fullName = 'Full name is required';
    if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = 'Enter a valid email';
    if (!/^\d{10}$/.test(phone.trim())) nextErrors.phone = 'Enter a valid 10-digit phone number';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    void requestOtp();
  };

  const handleSendOtpCompany = (): void => {
    const nextErrors: Record<string, string> = {};
    if (!/^\d{10}$/.test(phone.trim())) nextErrors.phone = 'Enter a valid 10-digit phone number';
    if (!companyName.trim()) nextErrors.companyName = 'Company name is required';
    const gstinCheck = validateGstin(gstin);
    if (!gstinCheck.valid) nextErrors.gstin = gstinCheck.message ?? 'Invalid GST number';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    void requestOtp();
  };

  const handleResendOtp = (): void => {
    if (cooldown > 0) return;
    void requestOtp();
  };

  const handleVerifyOtp = async (): Promise<void> => {
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: 'Enter the 6-digit code' });
      return;
    }
    setIsLoading(true);
    setErrors({});
    try {
      await apiRequest('POST', '/api/auth/otp/verify', { phone, purpose, code: otp });

      if (accountType === 'personal') {
        const res = await apiRequest('POST', '/api/auth/signup/personal', {
          full_name: fullName.trim(),
          email: email.trim(),
          phone,
        });
        const user = (await res.json()) as AuthUser;
        login(user);
        setStep('kyc');
      } else {
        setStep('preview');
      }
    } catch (err) {
      setErrors({ otp: parseApiErrorMessage(err, 'Incorrect code') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmCompany = async (): Promise<void> => {
    setIsLoading(true);
    setErrors({});
    try {
      const res = await apiRequest('POST', '/api/auth/signup/company', {
        phone,
        company_name: companyName.trim(),
        gstin,
      });
      const user = (await res.json()) as AuthUser;
      login(user);
      setLocation(redirect || '/home');
    } catch (err) {
      setErrors({ form: parseApiErrorMessage(err, 'Could not create account') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = (): void => {
    if (step === 'otp') {
      setStep('details');
      return;
    }
    if (step === 'preview') {
      setStep('details');
      return;
    }
    setLocation('/home');
  };

  const primaryAction =
    step === 'details'
      ? accountType === 'personal'
        ? handleSendOtpPersonal
        : handleSendOtpCompany
      : step === 'otp'
        ? () => void handleVerifyOtp()
        : () => void handleConfirmCompany();

  const primaryLabel =
    step === 'details' ? 'Send OTP' : step === 'otp' ? 'Verify & Continue' : 'Confirm & Create Account';

  return (
    <div className="min-h-[100dvh] bg-background safe-top safe-bottom" data-testid="screen-signup">
      <header className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back-signup"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="ml-2 font-semibold">Create Account</h1>
        </div>
      </header>

      <main className="px-4 py-8 flex flex-col items-center">
        <div className="max-w-md mx-auto w-full">
          <div className="flex flex-col items-center mb-8">
            <img src={bombinoLogo} alt="Bombino Express" className="h-auto w-[180px] mb-6 object-contain" />
            <h2 className="text-xl font-semibold text-[lab(34.0831_-9.57756_-27.7093)]">Create Account</h2>
            <p className="text-sm text-muted-foreground mt-1">Bringing the world closer</p>
          </div>

          {step === 'details' && (
            <div className="flex bg-muted rounded-xl p-1 mb-5">
              {(['personal', 'company'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => switchAccountType(type)}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize',
                    accountType === type ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'
                  )}
                  data-testid={`button-account-type-${type}`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.06),_0_1px_3px_oklch(17%_0.048_248_/_0.04)] p-6 space-y-5 animate-fade-in">
            {step === 'details' && accountType === 'personal' && (
              <>
                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Full name</Label>
                  <div className="relative mt-2">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); setErrors((prev) => ({ ...prev, fullName: '' })); }}
                      placeholder="Full name"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="name"
                      data-testid="input-full-name"
                    />
                  </div>
                  {errors.fullName && <p className="text-sm text-red-500 mt-1">{errors.fullName}</p>}
                </div>

                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Email</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: '' })); }}
                      placeholder="Enter your email"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>
                  {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
                </div>

                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Phone number</Label>
                  <div className="relative mt-2">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setErrors((prev) => ({ ...prev, phone: '' })); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtpPersonal()}
                      placeholder="10-digit mobile number"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="tel"
                      data-testid="input-phone"
                    />
                  </div>
                  {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
                </div>
              </>
            )}

            {step === 'details' && accountType === 'company' && (
              <>
                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Phone number</Label>
                  <div className="relative mt-2">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setErrors((prev) => ({ ...prev, phone: '' })); }}
                      placeholder="10-digit mobile number"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="tel"
                      data-testid="input-phone"
                    />
                  </div>
                  {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Company name</Label>
                  <div className="relative mt-2">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); setErrors((prev) => ({ ...prev, companyName: '' })); }}
                      placeholder="Company name"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="organization"
                      data-testid="input-company-name"
                    />
                  </div>
                  {errors.companyName && <p className="text-sm text-red-500 mt-1">{errors.companyName}</p>}
                </div>

                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">GST number</Label>
                  <div className="relative mt-2">
                    <Input
                      value={gstin}
                      onChange={(e) => {
                        setGstin(e.target.value.toUpperCase().slice(0, 15));
                        setErrors((prev) => ({ ...prev, gstin: '' }));
                      }}
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      className="h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl font-mono tracking-wide"
                      data-testid="input-gstin"
                    />
                  </div>
                  {errors.gstin ? (
                    <p className="text-sm text-red-500 mt-1">{errors.gstin}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Format-validated only — not looked up live.</p>
                  )}
                </div>
              </>
            )}

            {step === 'otp' && (
              <div>
                <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Enter OTP</Label>
                <p className="text-xs text-muted-foreground mt-1">Sent to {phone}</p>
                <div className="mt-3 flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} className="h-12 w-11 text-base" data-testid={`input-otp-slot-${i}`} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {errors.otp && <p className="text-sm text-red-500 mt-2 text-center">{errors.otp}</p>}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0}
                  className="text-xs text-[#F2A123] mt-3 mx-auto block disabled:text-muted-foreground disabled:cursor-not-allowed"
                  data-testid="button-resend-otp"
                >
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>
            )}

            {step === 'preview' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-[#F2A123]" />
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">
                    Review your details
                  </Label>
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium text-foreground">{phone}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">Company name</span>
                    <span className="font-medium text-foreground text-right">{companyName}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">GST number</span>
                    <span className="font-mono font-medium text-foreground">{gstin}</span>
                  </div>
                </div>
              </div>
            )}

            {step === 'kyc' && (
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  One last step — verify your identity to start booking.
                </p>
                <KycUpload
                  onValidChange={setKycResult}
                  fieldErrors={{
                    document_no: !!errors.kycMissing,
                    file: !!errors.kycMissing,
                  }}
                />
              </div>
            )}

            {errors.form && (
              <p className="text-sm text-red-500">{errors.form}</p>
            )}

            {step === 'kyc' ? (
              <Button
                onClick={() => {
                  if (!kycResult) {
                    setErrors({ kycMissing: 'Please upload your identity document' });
                    return;
                  }
                  setLocation(redirect || '/home');
                }}
                className="w-full h-12 text-base font-semibold bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] rounded-xl shadow-[0_4px_20px_oklch(17%_0.048_248_/_0.10)] mt-1"
                data-testid="button-continue-kyc"
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={primaryAction}
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] rounded-xl shadow-[0_4px_20px_oklch(17%_0.048_248_/_0.10)] disabled:opacity-70 mt-1"
                data-testid="button-create-account"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : primaryLabel}
              </Button>
            )}
          </div>

          {step === 'details' && (
            <p className="text-center text-sm text-muted-foreground mt-5">
              Already have an account?{' '}
              <Link
                href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
                className="text-[#F2A123] font-semibold hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground mt-3">
            By continuing you agree to our{' '}
            <a href="/privacy" className="text-[#F2A123] underline hover:text-[#F2A123]/80">
              Privacy Policy
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
