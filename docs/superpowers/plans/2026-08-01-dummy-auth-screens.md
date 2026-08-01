# Dummy Auth Screens (Login + Signup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current email/password `Login.tsx` and static "email us" `Signup.tsx` with two client-only, no-backend phone+OTP screens (OTP fully dummy — any 4-6 digits accepted) so booking (A3) can be reached and worked on — building/testing the form itself — before real OTP/ITD credentials exist. This does not let a booking be fully submitted: `POST /api/shipments` still requires a real server session (`req.session.itdToken`), which this scaffolding intentionally does not build.

**Architecture:** Both screens are two-step local-state forms. Step 1 collects identity fields; step 2 collects a dummy OTP. On verify, each screen builds an `AuthUser` object (existing type in `client/src/lib/store.ts`, unchanged) and calls the existing `login(user)` store action — no server calls, no changes to `store.ts`, `App.tsx`, or any `/api/*` route.

**Tech Stack:** React 19 + TypeScript, Wouter routing, existing shadcn/ui primitives (`Button`, `Input`, `Label`), `lucide-react` icons, `useToast` from `@/hooks/use-toast`.

## Global Constraints

- No backend/API calls in either screen — `apiRequest` must not be imported or used.
- No changes to `client/src/lib/store.ts`, `AuthUser` type, or `client/src/App.tsx` (routes already point at these files).
- OTP: any 4-6 digit input accepted, no server verification.
- Reuse existing visual language from the current `Login.tsx`: white rounded-2xl card, `#F3F4F6` input backgrounds, `#F2A123` primary button, Bombino logo header, `min-h-[100dvh]` + `safe-top safe-bottom` classes, `data-testid` naming convention (`input-*`, `button-*`, `screen-*`).
- Login and Signup do NOT share a component/hook for the OTP step — each implements its own (per design doc, avoids coupling that would need unwinding when real A2 lands).
- No test framework is configured in this repo (per `CLAUDE.md`) — verification is `npm run check` (TypeScript) plus manual click-through, not automated tests.

---

### Task 1: Replace Login.tsx with phone + dummy OTP flow

**Files:**
- Modify: `client/src/pages/Login.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAppStore` → `login(user: AuthUser)` from `@/lib/store` (existing, unchanged). `AuthUser` fields: `id`, `customerId`, `code`, `email`, `fullName`, `username`, `role` (all `string`).
- Produces: nothing new consumed by other tasks — Task 2 (Signup) independently builds its own `AuthUser` and links to `/login`, but does not import anything from this file.

- [ ] **Step 1: Replace the full contents of `client/src/pages/Login.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { ArrowLeft, Phone, ShieldCheck, Loader2 } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import bombinoLogo from '@/assets/bombino-logo.png';

const RESEND_COOLDOWN_SECONDS = 30;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const { toast } = useToast();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const redirect = new URLSearchParams(window.location.search).get('redirect');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = () => {
    if (!/^\d{10}$/.test(phone.trim())) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    setError('');
    setStep('otp');
    setCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: 'OTP sent', description: `Sent to ${phone.trim()}` });
  };

  const handleResendOtp = () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: 'OTP resent', description: `Sent to ${phone.trim()}` });
  };

  const handleVerify = () => {
    if (!/^\d{4,6}$/.test(otp.trim())) {
      setError('Enter the OTP you received');
      return;
    }
    setIsLoading(true);
    setError('');

    const trimmedPhone = phone.trim();
    const user: AuthUser = {
      id: `local-${Date.now()}`,
      customerId: `local-${Date.now()}`,
      code: `local-${Date.now()}`,
      email: '',
      fullName: `Customer ${trimmedPhone.slice(-4)}`,
      username: trimmedPhone,
      role: 'customer',
    };

    login(user);
    setLocation(redirect || '/home');
  };

  return (
    <div className="min-h-[100dvh] bg-background safe-top safe-bottom" data-testid="screen-login">
      <header className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => (step === 'otp' ? setStep('phone') : setLocation('/home'))}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back-login"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="ml-2 font-semibold">Sign In</h1>
        </div>
      </header>

      <main className="px-4 py-8 flex flex-col items-center">
        <div className="max-w-md mx-auto w-full">
          <div className="flex flex-col items-center mb-8">
            <img src={bombinoLogo} alt="Bombino Express" className="h-auto w-[180px] mb-6 object-contain" />
            <h2 className="text-xl font-semibold text-[lab(34.0831_-9.57756_-27.7093)]">Sign In</h2>
            <p className="text-sm text-muted-foreground mt-1">Bringing the world closer</p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.06),_0_1px_3px_oklch(17%_0.048_248_/_0.04)] p-6 space-y-5 animate-fade-in">
            {step === 'phone' ? (
              <div>
                <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Phone number</Label>
                <div className="relative mt-2">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    placeholder="10-digit mobile number"
                    className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                    autoComplete="tel"
                    data-testid="input-phone"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Enter OTP</Label>
                <p className="text-xs text-muted-foreground mt-1">Sent to {phone}</p>
                <div className="relative mt-2">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    placeholder="Enter OTP"
                    className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                    autoComplete="one-time-code"
                    data-testid="input-otp"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0}
                  className="text-xs text-[#F2A123] mt-2 disabled:text-muted-foreground disabled:cursor-not-allowed"
                  data-testid="button-resend-otp"
                >
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              onClick={step === 'phone' ? handleSendOtp : handleVerify}
              disabled={isLoading}
              className="w-full h-12 text-base font-semibold bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] rounded-xl shadow-[0_4px_20px_oklch(17%_0.048_248_/_0.10)] disabled:opacity-70 mt-1"
              data-testid="button-sign-in"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : step === 'phone' ? (
                'Send OTP'
              ) : (
                'Verify & Sign In'
              )}
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-5">
            New here?{' '}
            <Link
              href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'}
              className="text-[#F2A123] font-semibold hover:underline"
            >
              Create account
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-3">
            By signing in you agree to our{' '}
            <a href="/privacy" className="text-[#F2A123] underline hover:text-[#F2A123]/80">
              Privacy Policy
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no errors referencing `client/src/pages/Login.tsx`

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open the app, navigate to `/login`:
- Enter a 9-digit number, tap "Send OTP" → inline error "Enter a valid 10-digit phone number", stays on step 1.
- Enter a valid 10-digit number, tap "Send OTP" → advances to OTP step, toast "OTP sent" appears, "Resend OTP" shows a counting-down `Resend OTP in 30s` / `29s` / ... and re-enables at 0.
- Enter any 4-6 digit OTP, tap "Verify & Sign In" → redirected to `/home` (or to `?redirect=` target if the URL had one), header/profile shows `Customer <last4>`.
- Tap back arrow on OTP step → returns to phone step (not to `/home`).
- Tap "Create account" → navigates to `/signup`, forwarding `?redirect=` if present.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Login.tsx
git commit -m "feat: replace email/password login with dummy phone+OTP flow"
```

---

### Task 2: Replace Signup.tsx with name/email/phone + dummy OTP flow

**Files:**
- Modify: `client/src/pages/Signup.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAppStore` → `login(user: AuthUser)` from `@/lib/store` (same as Task 1). Does not import anything from `Login.tsx`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace the full contents of `client/src/pages/Signup.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Phone, ShieldCheck, Loader2 } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import bombinoLogo from '@/assets/bombino-logo.png';

const RESEND_COOLDOWN_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const { toast } = useToast();
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const redirect = new URLSearchParams(window.location.search).get('redirect');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = () => {
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = 'Enter a valid email';
    if (!/^\d{10}$/.test(phone.trim())) nextErrors.phone = 'Enter a valid 10-digit phone number';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setStep('otp');
    setCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: 'OTP sent', description: `Sent to ${phone.trim()}` });
  };

  const handleResendOtp = () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: 'OTP resent', description: `Sent to ${phone.trim()}` });
  };

  const handleVerify = () => {
    if (!/^\d{4,6}$/.test(otp.trim())) {
      setErrors({ otp: 'Enter the OTP you received' });
      return;
    }
    setIsLoading(true);
    setErrors({});

    const user: AuthUser = {
      id: `local-${Date.now()}`,
      customerId: `local-${Date.now()}`,
      code: `local-${Date.now()}`,
      email: email.trim(),
      fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      username: phone.trim(),
      role: 'customer',
    };

    login(user);
    setLocation(redirect || '/home');
  };

  return (
    <div className="min-h-[100dvh] bg-background safe-top safe-bottom" data-testid="screen-signup">
      <header className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => (step === 'otp' ? setStep('details') : setLocation('/home'))}
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

          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.06),_0_1px_3px_oklch(17%_0.048_248_/_0.04)] p-6 space-y-5 animate-fade-in">
            {step === 'details' ? (
              <>
                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">First name</Label>
                  <div className="relative mt-2">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setErrors((prev) => ({ ...prev, firstName: '' })); }}
                      placeholder="First name"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="given-name"
                      data-testid="input-first-name"
                    />
                  </div>
                  {errors.firstName && <p className="text-sm text-red-500 mt-1">{errors.firstName}</p>}
                </div>

                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Last name</Label>
                  <div className="relative mt-2">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setErrors((prev) => ({ ...prev, lastName: '' })); }}
                      placeholder="Last name"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="family-name"
                      data-testid="input-last-name"
                    />
                  </div>
                  {errors.lastName && <p className="text-sm text-red-500 mt-1">{errors.lastName}</p>}
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
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                      placeholder="10-digit mobile number"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="tel"
                      data-testid="input-phone"
                    />
                  </div>
                  {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
                </div>
              </>
            ) : (
              <div>
                <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Enter OTP</Label>
                <p className="text-xs text-muted-foreground mt-1">Sent to {phone}</p>
                <div className="relative mt-2">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrors((prev) => ({ ...prev, otp: '' })); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    placeholder="Enter OTP"
                    className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                    autoComplete="one-time-code"
                    data-testid="input-otp"
                  />
                </div>
                {errors.otp && <p className="text-sm text-red-500 mt-1">{errors.otp}</p>}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0}
                  className="text-xs text-[#F2A123] mt-2 disabled:text-muted-foreground disabled:cursor-not-allowed"
                  data-testid="button-resend-otp"
                >
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>
            )}

            <Button
              onClick={step === 'details' ? handleSendOtp : handleVerify}
              disabled={isLoading}
              className="w-full h-12 text-base font-semibold bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] rounded-xl shadow-[0_4px_20px_oklch(17%_0.048_248_/_0.10)] disabled:opacity-70 mt-1"
              data-testid="button-create-account"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : step === 'details' ? (
                'Send OTP'
              ) : (
                'Verify & Create Account'
              )}
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{' '}
            <Link
              href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
              className="text-[#F2A123] font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>

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
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no errors referencing `client/src/pages/Signup.tsx`

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, navigate to `/signup`:
- Tap "Send OTP" with all fields empty → inline errors under First name, Last name, Email, Phone number; stays on step 1.
- Fill first/last name, an invalid email (e.g. `abc`), valid 10-digit phone → error only under Email.
- Fill all four fields validly, tap "Send OTP" → advances to OTP step, toast "OTP sent", resend cooldown behaves as in Task 1.
- Enter any 4-6 digit OTP, tap "Verify & Create Account" → redirected to `/home` (or `?redirect=` target), header/profile shows the entered full name.
- Tap "Sign in" link → navigates to `/login`, forwarding `?redirect=` if present.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Signup.tsx
git commit -m "feat: replace static signup page with dummy name/email/phone+OTP flow"
```

---

### Task 3: End-to-end verification against the booking gate

**Files:** none (verification only, no code changes)

**Interfaces:**
- Consumes: `Login.tsx` and `Signup.tsx` from Tasks 1-2, and the existing (unmodified) gate logic in `client/src/pages/Home.tsx:738` and `client/src/pages/CreateShipment.tsx`.

- [ ] **Step 1: Full logged-out booking flow through Login**

Run: `npm run dev`. With no prior session (clear `bombino-storage` from localStorage, or use a fresh browser profile), open `/home`, tap the booking CTA that requires login.
Expected: redirected to `/login?redirect=/create`. Complete phone + dummy OTP. Expected: lands on `/create` with `isLoggedIn` true.

- [ ] **Step 2: Full logged-out booking flow through Signup**

Clear session again. From `/login?redirect=/create`, tap "Create account" (should forward the redirect param). Fill the signup form + dummy OTP.
Expected: lands on `/create` with `isLoggedIn` true and the entered name visible in the header/profile.

- [ ] **Step 3: Confirm no network calls fired**

While completing both flows above, open browser dev tools Network tab and confirm no request to `/api/auth/*` (or any `/api/*`) fires from either screen — only client-side navigation.

- [ ] **Step 4: Final typecheck across the whole app**

Run: `npm run check`
Expected: exits 0, no errors.
