import { useState, useEffect } from 'react';
import { User, Mail, Phone, Building2, Loader2, ShieldCheck, ArrowRight, MapPin } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KycUpload, type KycUploadResult } from '@/components/KycUpload';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';
import { usePincodeLookup } from '@/hooks/usePincodeLookup';
import { validateGstin } from '@shared/gstin';
import { INDIA_HUBS } from '@shared/hubs';
import { cn } from '@/lib/utils';
import bombinoLogo from '@/assets/bombino-logo.png';

const RESEND_COOLDOWN_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccountType = 'personal' | 'company';
/** Order here is the visual order, which the arrow-key handler relies on. */
const ACCOUNT_TYPES = ['personal', 'company'] as const satisfies readonly AccountType[];
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
  const [companyEmail, setCompanyEmail] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [hubId, setHubId] = useState('');
  const { hint: pincodeHint, lookup: lookupPincode } = usePincodeLookup();

  // Shared
  const searchParams = new URLSearchParams(window.location.search);
  // /login verifies the number before sending anyone here, so the OTP round
  // trip is already spent. Re-sending a second code to the same phone would
  // burn the hourly ceiling and read as a bug to the customer.
  const preVerified = searchParams.get('verified') === '1';
  const [phone, setPhone] = useState(searchParams.get('phone') ?? '');
  const [otp, setOtp] = useState('');

  const redirect = searchParams.get('redirect');
  // One purpose for the whole entry flow — /login issues the code without yet
  // knowing whether it ends in a sign-in, a link, or this screen.
  const purpose = 'auth';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** Left/Right (and Home/End) move between tabs, per the WAI-ARIA tabs
   *  pattern. Selection follows focus, which is correct here — switching is
   *  cheap and reversible, and it saves a second keypress. */
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const current = ACCOUNT_TYPES.indexOf(accountType);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? ACCOUNT_TYPES.length - 1
          : e.key === 'ArrowLeft'
            ? (current - 1 + ACCOUNT_TYPES.length) % ACCOUNT_TYPES.length
            : (current + 1) % ACCOUNT_TYPES.length;

    switchAccountType(ACCOUNT_TYPES[next]);
    const tabs = e.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    (tabs?.[next] as HTMLButtonElement | undefined)?.focus();
  };

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
      // Redundant with the OTP step subtitle; see Login.tsx.
    } catch (err) {
      setErrors({ form: parseApiErrorMessage(err, 'Could not send OTP') });
    } finally {
      setIsLoading(false);
    }
  };

  const createPersonal = async (): Promise<void> => {
    const res = await apiRequest('POST', '/api/auth/signup/personal', {
      full_name: fullName.trim(),
      email: email.trim(),
      phone,
    });
    const user = (await res.json()) as AuthUser;
    login(user);
    setStep('kyc');
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
    if (preVerified) {
      setIsLoading(true);
      void createPersonal()
        .catch((err) => setErrors({ form: parseApiErrorMessage(err, 'Could not create account') }))
        .finally(() => setIsLoading(false));
      return;
    }
    void requestOtp();
  };

  const handleSendOtpCompany = (): void => {
    const nextErrors: Record<string, string> = {};
    if (!/^\d{10}$/.test(phone.trim())) nextErrors.phone = 'Enter a valid 10-digit phone number';
    if (!companyName.trim()) nextErrors.companyName = 'Company name is required';
    const gstinCheck = validateGstin(gstin);
    if (!gstinCheck.valid) nextErrors.gstin = gstinCheck.message ?? 'Invalid GST number';
    if (!EMAIL_PATTERN.test(companyEmail.trim())) nextErrors.companyEmail = 'Enter a valid email';
    if (!address.trim()) nextErrors.address = 'Address is required';
    else if (address.trim().length > 200) nextErrors.address = 'Address must be 200 characters or less';
    if (!/^\d{6}$/.test(pincode.trim())) nextErrors.pincode = 'Enter a 6-digit pincode';
    if (!city.trim()) nextErrors.city = 'City is required';
    else if (city.trim().length > 80) nextErrors.city = 'City must be 80 characters or less';
    if (!state.trim()) nextErrors.state = 'State is required';
    else if (state.trim().length > 80) nextErrors.state = 'State must be 80 characters or less';
    if (contactPerson.trim().length > 80) nextErrors.contactPerson = 'Contact person must be 80 characters or less';
    if (!hubId) nextErrors.hubId = 'Select a hub';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    if (preVerified) {
      setStep('preview');
      return;
    }
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
        await createPersonal();
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
        email: companyEmail.trim(),
        address: address.trim(),
        pincode: pincode.trim(),
        city: city.trim(),
        state: state.trim(),
        contact_person: contactPerson.trim(),
        hub_id: Number(hubId),
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
    step === 'details'
      ? preVerified
        ? 'Continue'
        : 'Send code'
      : step === 'otp'
        ? 'Verify & continue'
        : 'Confirm & create account';

  const stepIndex = step === 'details' ? 1 : step === 'otp' ? 2 : 3;
  const stepSubtitle =
    step === 'details' ? (
      'Tell us who the account is for.'
    ) : step === 'otp' ? (
      <>
        We sent a 6-digit code to{' '}
        <span className="doc-mono font-semibold text-foreground whitespace-nowrap">
          +91 {phone}
        </span>
        .
      </>
    ) : step === 'preview' ? (
      'Check these details before we create the account.'
    ) : (
      'Verify your identity to start booking.'
    );

  return (
    <AuthShell
      title="Create account"
      subtitle={stepSubtitle}
      onBack={handleBack}
      step={stepIndex}
      totalSteps={3}
      testId="screen-signup"
      footer={
        step === 'details' ? (
          <div className="doc-rule mt-8 pt-4">
            <Link
              href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
              className="doc-link focus-ring"
            >
              Already registered? Sign in
              <ArrowRight className="w-3 h-3 shrink-0" />
            </Link>
          </div>
        ) : null
      }
    >
      {/* Segmented selector, not a pill: two cells of one ruled box, the
          active one filled amber. Matches the ledger language of the rest
          of the flow. */}
      {step === 'details' && (
        <div className="doc-segment" role="tablist" aria-label="Account type">
          {ACCOUNT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={accountType === type}
              // Roving tabindex: a tablist is one stop in the tab order, and
              // the arrow keys move between its tabs (WAI-ARIA tabs pattern).
              tabIndex={accountType === type ? 0 : -1}
              onKeyDown={handleTabKeyDown}
              onClick={() => switchAccountType(type)}
              className={cn(
                accountType === type
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              )}
              data-testid={`button-account-type-${type}`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

            {step === 'details' && accountType === 'personal' && (
              <>
                <div>
                  <Label className="doc-label">Full name</Label>
                  <div className="relative mt-2">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); setErrors((prev) => ({ ...prev, fullName: '' })); }}
                      placeholder="Full name"
                      className="doc-field pl-10"
                      autoComplete="name"
                      data-testid="input-full-name"
                    />
                  </div>
                  {errors.fullName && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.fullName}</p>}
                </div>

                <div>
                  <Label className="doc-label">Email</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: '' })); }}
                      placeholder="Enter your email"
                      className="doc-field pl-10"
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>
                  {errors.email && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.email}</p>}
                </div>

                <div>
                  <Label className="doc-label">Phone number</Label>
                  <div className="relative mt-2">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setErrors((prev) => ({ ...prev, phone: '' })); }}
                      // Already verified upstream — editing it here would
                      // silently detach the code from the number being saved.
                      disabled={preVerified}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtpPersonal()}
                      placeholder="10-digit mobile number"
                      className="doc-field pl-10"
                      autoComplete="tel"
                      data-testid="input-phone"
                    />
                  </div>
                  {errors.phone && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
                </div>
              </>
            )}

            {step === 'details' && accountType === 'company' && (
              <>
                <div>
                  <Label className="doc-label">Phone number</Label>
                  <div className="relative mt-2">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setErrors((prev) => ({ ...prev, phone: '' })); }}
                      // Already verified upstream — editing it here would
                      // silently detach the code from the number being saved.
                      disabled={preVerified}
                      placeholder="10-digit mobile number"
                      className="doc-field pl-10"
                      autoComplete="tel"
                      data-testid="input-phone"
                    />
                  </div>
                  {errors.phone && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.phone}</p>}
                </div>

                <div>
                  <Label className="doc-label">Company name</Label>
                  <div className="relative mt-2">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); setErrors((prev) => ({ ...prev, companyName: '' })); }}
                      placeholder="Company name"
                      className="doc-field pl-10"
                      autoComplete="organization"
                      data-testid="input-company-name"
                    />
                  </div>
                  {errors.companyName && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.companyName}</p>}
                </div>

                <div>
                  <Label className="doc-label">GST number</Label>
                  <div className="relative mt-2">
                    <Input
                      value={gstin}
                      onChange={(e) => {
                        setGstin(e.target.value.toUpperCase().slice(0, 15));
                        setErrors((prev) => ({ ...prev, gstin: '' }));
                      }}
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      className="doc-field font-mono tracking-wide"
                      data-testid="input-gstin"
                    />
                  </div>
                  {errors.gstin ? (
                    <p role="alert" className="text-sm text-destructive mt-1.5">{errors.gstin}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Format-validated only — not looked up live.</p>
                  )}
                </div>

                <div>
                  <Label className="doc-label">Email</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      value={companyEmail}
                      onChange={(e) => { setCompanyEmail(e.target.value); setErrors((prev) => ({ ...prev, companyEmail: '' })); }}
                      placeholder="Company email"
                      className="doc-field pl-10"
                      autoComplete="email"
                      data-testid="input-company-email"
                    />
                  </div>
                  {errors.companyEmail && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.companyEmail}</p>}
                </div>

                <div>
                  <Label className="doc-label">Contact person <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative mt-2">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={contactPerson}
                      onChange={(e) => { setContactPerson(e.target.value); setErrors((prev) => ({ ...prev, contactPerson: '' })); }}
                      placeholder="Contact person"
                      maxLength={80}
                      className="doc-field pl-10"
                      autoComplete="name"
                      data-testid="input-contact-person"
                    />
                  </div>
                  {errors.contactPerson && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.contactPerson}</p>}
                </div>

                <div>
                  <Label className="doc-label">Address</Label>
                  <div className="relative mt-2">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={address}
                      onChange={(e) => { setAddress(e.target.value); setErrors((prev) => ({ ...prev, address: '' })); }}
                      placeholder="Street address"
                      maxLength={200}
                      className="doc-field pl-10"
                      autoComplete="street-address"
                      data-testid="input-company-address"
                    />
                  </div>
                  {errors.address && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.address}</p>}
                </div>

                <div>
                  <Label className="doc-label">Pincode</Label>
                  <Input
                    value={pincode}
                    onChange={(e) => {
                      setPincode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setErrors((prev) => ({ ...prev, pincode: '' }));
                    }}
                    onBlur={() => {
                      void lookupPincode(pincode, 'IN', ({ city: nextCity, state: nextState }) => {
                        setCity(nextCity);
                        setState(nextState);
                        setErrors((prev) => ({ ...prev, city: '', state: '' }));
                      });
                    }}
                    placeholder="6-digit pincode"
                    inputMode="numeric"
                    maxLength={6}
                    className="doc-field mt-2"
                    autoComplete="postal-code"
                    data-testid="input-company-pincode"
                  />
                  {pincodeHint && (
                    <p className="text-xs text-muted-foreground mt-1">{pincodeHint}</p>
                  )}
                  {errors.pincode && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.pincode}</p>}
                </div>

                <div>
                  <Label className="doc-label">City</Label>
                  <Input
                    value={city}
                    onChange={(e) => { setCity(e.target.value); setErrors((prev) => ({ ...prev, city: '' })); }}
                    placeholder="City"
                    maxLength={80}
                    className="doc-field mt-2"
                    autoComplete="address-level2"
                    data-testid="input-company-city"
                  />
                  {errors.city && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.city}</p>}
                </div>

                <div>
                  <Label className="doc-label">State</Label>
                  <Input
                    value={state}
                    onChange={(e) => { setState(e.target.value); setErrors((prev) => ({ ...prev, state: '' })); }}
                    placeholder="State"
                    maxLength={80}
                    className="doc-field mt-2"
                    autoComplete="address-level1"
                    data-testid="input-company-state"
                  />
                  {errors.state && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.state}</p>}
                </div>

                <div>
                  <Label className="doc-label">Hub</Label>
                  <Select
                    value={hubId || undefined}
                    onValueChange={(value) => {
                      setHubId(value);
                      setErrors((prev) => ({ ...prev, hubId: '' }));
                    }}
                  >
                    <SelectTrigger className="doc-field mt-2" data-testid="select-company-hub">
                      <SelectValue placeholder="Select a hub" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIA_HUBS.map((hub) => (
                        <SelectItem key={hub.id} value={String(hub.id)}>
                          {hub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.hubId && <p role="alert" className="text-sm text-destructive mt-1.5">{errors.hubId}</p>}
                </div>
              </>
            )}

            {step === 'otp' && (
              <div>
                <Label className="doc-label">Enter OTP</Label>
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
                {errors.otp && <p role="alert" className="text-sm text-destructive mt-2">{errors.otp}</p>}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0}
                  className="text-xs text-accent mt-3 mx-auto block disabled:text-muted-foreground disabled:cursor-not-allowed"
                  data-testid="button-resend-otp"
                >
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>
            )}

            {step === 'preview' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-5 h-5 text-accent" />
                  <Label className="doc-label">
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
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">GST number</span>
                    <span className="font-mono font-medium text-foreground">{gstin}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium text-foreground text-right">{companyEmail}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">Contact person</span>
                    <span className="font-medium text-foreground text-right">{contactPerson.trim() || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">Address</span>
                    <span className="font-medium text-foreground text-right">{address}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">Pincode</span>
                    <span className="font-medium text-foreground">{pincode}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">City</span>
                    <span className="font-medium text-foreground text-right">{city}</span>
                  </div>
                  <div className="flex justify-between gap-3 pb-3 border-b border-border">
                    <span className="text-muted-foreground">State</span>
                    <span className="font-medium text-foreground text-right">{state}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Hub</span>
                    <span className="font-medium text-foreground text-right">
                      {INDIA_HUBS.find((h) => String(h.id) === hubId)?.name ?? hubId}
                    </span>
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
              <p role="alert" className="text-sm text-destructive">{errors.form}</p>
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
                className="doc-btn mt-1"
                data-testid="button-continue-kyc"
              >
                Continue
              </Button>
            ) : (
              <Button
                onClick={primaryAction}
                disabled={isLoading}
                className="doc-btn mt-1"
                data-testid="button-create-account"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : primaryLabel}
              </Button>
            )}
    </AuthShell>
  );
}
