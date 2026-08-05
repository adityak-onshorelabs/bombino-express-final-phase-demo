import { useState, useEffect, useRef } from 'react';
import { Loader2, Mail, Lock, Eye, EyeOff, UserPlus, BadgeCheck, ArrowRight } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { landingPathForRole } from '@/lib/surface';
import { parseApiErrorMessage } from '@/lib/apiError';

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Single entry point for every account.
 *
 * The phone number is the identity: it is collected and verified first, and
 * only then does the server say whether it already belongs to an account. A
 * customer who predates this app — one ITD provisioned an email/password for —
 * proves that account once on the `link` step, after which their number signs
 * them in on its own and the password is never asked for again.
 *
 * phone → otp → ┬ (number known)   sign in
 *               └ (number unknown) choice → link (existing ITD account)
 *                                         └ /signup (new customer)
 */
type Step = 'phone' | 'otp' | 'choice' | 'link';

type ContinueResponse =
  | { status: 'signed_in'; user: AuthUser }
  | { status: 'needs_account' };

const STEP_META: Record<Step, { title: string; subtitle: string; index: number }> = {
  phone: {
    title: 'Sign in',
    subtitle: 'Enter your mobile number to get started. New and returning customers both start here.',
    index: 1,
  },
  otp: { title: 'Verify your number', subtitle: '', index: 2 },
  choice: { title: 'One more thing', subtitle: '', index: 3 },
  link: {
    title: 'Find your account',
    subtitle: 'Sign in once with your Bombino email and password.',
    index: 3,
  },
};

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /** Inline confirmation for a resend, where nothing else on screen changes. */
  const [justSent, setJustSent] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  // Set when the session lapsed under the user rather than them signing out.
  // Without it, being thrown back here reads as the app losing their login for
  // no reason.
  const expired = params.get('expired') === '1';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Land focus where the next input is, so the flow can be completed without
  // reaching for the screen between steps.
  useEffect(() => {
    if (step === 'phone') phoneRef.current?.focus();
    if (step === 'link') emailRef.current?.focus();
  }, [step]);

  const finishSignIn = (user: AuthUser): void => {
    login(user);
    setLocation(redirect || landingPathForRole(user.role));
  };

  const requestOtp = async (): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      await apiRequest('POST', '/api/auth/otp/request', { phone, purpose: 'auth' });
      setStep('otp');
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      // No toast: the OTP step's own subtitle already reads "We sent a
      // 6-digit code to +91 …". A full-width banner over the header repeated
      // that and covered the back button while doing it.
      setJustSent(true);
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

  const handleResendOtp = (): void => {
    if (cooldown > 0) return;
    void requestOtp();
  };

  const submitOtp = async (code: string): Promise<void> => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiRequest('POST', '/api/auth/phone/continue', { phone, code });
      const data = (await res.json()) as ContinueResponse;
      if (data.status === 'signed_in') {
        finishSignIn(data.user);
        return;
      }
      setStep('choice');
    } catch (err) {
      setError(parseApiErrorMessage(err, 'Incorrect code'));
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = (): void => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code');
      return;
    }
    void submitOtp(otp);
  };

  const handleLink = async (): Promise<void> => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await apiRequest('POST', '/api/auth/link/itd', {
        phone,
        email: email.trim(),
        password,
      });
      const user = (await res.json()) as AuthUser;
      toast({
        title: 'Mobile number linked',
        description: `${phone} is now linked to your account.`,
      });
      finishSignIn(user);
    } catch (err) {
      setError(parseApiErrorMessage(err, 'Could not verify those credentials'));
    } finally {
      setIsLoading(false);
    }
  };

  // The number is already verified, so signup can skip straight to details.
  const goToSignup = (): void => {
    const search = new URLSearchParams({ phone, verified: '1' });
    if (redirect) search.set('redirect', redirect);
    setLocation(`/signup?${search.toString()}`);
  };

  const handleBack = (): void => {
    const previous: Partial<Record<Step, Step>> = {
      otp: 'phone',
      choice: 'phone',
      link: 'choice',
    };
    const target = previous[step];
    if (!target) {
      setLocation('/home');
      return;
    }
    setStep(target);
    setError('');
  };

  const meta = STEP_META[step];

  /** The customer's own number, set the way every other figure on these
   *  screens is set. It is the subject of both sentences below, so it should
   *  not read as ordinary body text. */
  const phoneMark = (
    <span className="doc-mono font-semibold text-foreground whitespace-nowrap">
      +91 {phone}
    </span>
  );

  const subtitle =
    step === 'otp' ? (
      <>We sent a 6-digit code to {phoneMark}.</>
    ) : step === 'choice' ? (
      <>We don't have {phoneMark} on file yet.</>
    ) : (
      meta.subtitle
    );

  return (
    <AuthShell
      title={meta.title}
      subtitle={subtitle}
      onBack={handleBack}
      step={meta.index}
      totalSteps={3}
      testId="screen-login"
      footer={
        step === 'phone' ? (
          <div className="doc-rule mt-8 pt-4">
            <Link
              href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'}
              className="doc-link focus-ring"
            >
              New here? Create account
              <ArrowRight className="w-3 h-3 shrink-0" />
            </Link>
          </div>
        ) : null
      }
    >
      {expired && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
          data-testid="notice-session-expired"
        >
          <p className="text-sm font-semibold text-amber-900">Your session expired</p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            You were signed out for security. Sign in again to pick up where you left off.
          </p>
        </div>
      )}

      {step === 'phone' && (
        <div>
          <Label htmlFor="login-phone" className="doc-label">
            Mobile number
          </Label>
          {/* Country code is a fixed segment, not a placeholder inside the
              field — India-only today, and showing it removes any doubt about
              whether to type it. */}
          <div className="mt-2 flex items-stretch border border-border focus-within:border-accent transition-colors"
               style={{ borderRadius: 'var(--doc-radius)' }}>
            <span className="doc-mono flex items-center px-3 text-sm text-muted-foreground border-r border-border bg-muted/60 select-none">
              +91
            </span>
            <Input
              id="login-phone"
              ref={phoneRef}
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
              placeholder="00000 00000"
              className="doc-mono h-12 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 rounded-none"
              autoComplete="tel"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              data-testid="input-phone"
            />
          </div>
        </div>
      )}

      {step === 'otp' && (
        <div>
          <Label className="doc-label">Verification code</Label>
          <div className="mt-2">
            <InputOTP
              maxLength={6}
              value={otp}
              autoFocus
              onChange={(v) => {
                setOtp(v);
                setError('');
                // Submit as soon as the last digit lands — the extra tap on
                // "Verify" was pure ceremony once the code is complete.
                if (v.length === 6 && !isLoading) void submitOtp(v);
              }}
            >
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="doc-mono h-14 w-12 text-lg border border-border data-[active=true]:border-accent data-[active=true]:ring-0"
                    style={{ borderRadius: 'var(--doc-radius)' }}
                    data-testid={`input-otp-slot-${i}`}
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="flex items-center gap-3 mt-3">
            {justSent && (
              <span
                className="doc-label text-accent"
                role="status"
                data-testid="text-code-sent"
              >
                Code sent
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={cooldown > 0}
            className="doc-label tap-target focus-ring -ml-1 px-1 hover:text-accent disabled:cursor-not-allowed"
            data-testid="button-resend-otp"
          >
            {/* Rendered as a clock rather than "28s" — `uppercase` on the
                label class turned the unit into "28S", and a mono countdown
                suits the document language better anyway. */}
            {cooldown > 0
              ? `Resend in 0:${String(cooldown).padStart(2, '0')}`
              : 'Resend code'}
          </button>
        </div>
      )}

      {step === 'choice' && (
        <div>
          <p className="doc-label mb-2">Have you shipped with Bombino before?</p>
          <div className="doc-choice-group">
            <button
              type="button"
              onClick={() => {
                setStep('link');
                setError('');
              }}
              className="doc-choice focus-ring"
              data-testid="button-existing-customer"
            >
              <BadgeCheck className="w-[18px] h-[18px] text-accent shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  Yes, I have an account
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Sign in with your email and password once — we'll link this number to it.
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            </button>
            <button
              type="button"
              onClick={goToSignup}
              className="doc-choice focus-ring"
              data-testid="button-new-customer"
            >
              <UserPlus className="w-[18px] h-[18px] text-accent shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  No, I'm new here
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Create an account — it takes a minute.
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            </button>
          </div>
        </div>
      )}

      {step === 'link' && (
        <>
          <div className="border border-border bg-muted/50 px-4 py-3" style={{ borderRadius: 'var(--doc-radius)' }}>
            <p className="doc-label">Linking</p>
            <p className="doc-mono mt-1 text-sm font-medium text-foreground">+91 {phone}</p>
          </div>

          <div>
            <Label htmlFor="login-email" className="doc-label">
              Email
            </Label>
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                id="login-email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleLink()}
                placeholder="Enter your email"
                className="doc-field pl-10"
                autoComplete="email"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                data-testid="input-email"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="login-password" className="doc-label">
              Password
            </Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10 pointer-events-none" />
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleLink()}
                placeholder="Enter your password"
                className="doc-field pl-10 pr-12"
                autoComplete="current-password"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="tap-target focus-ring absolute right-1 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* role="alert" so the message is announced, not just coloured red. */}
      {error && (
        <p
          id="login-error"
          role="alert"
          className="text-sm text-destructive text-center"
          data-testid="text-login-error"
        >
          {error}
        </p>
      )}

      {step !== 'choice' && (
        <Button
          onClick={
            step === 'phone' ? handleSendOtp : step === 'otp' ? handleVerify : () => void handleLink()
          }
          disabled={isLoading || (step === 'phone' && phone.length !== 10)}
          className="doc-btn justify-between px-5"
          data-testid="button-sign-in"
        >
          {isLoading ? (
            <>
              <span>Please wait</span>
              <Loader2 className="w-4 h-4 animate-spin" />
            </>
          ) : (
            <>
              <span>
                {step === 'phone' ? 'Send code' : step === 'otp' ? 'Verify' : 'Link & sign in'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      )}
    </AuthShell>
  );
}
