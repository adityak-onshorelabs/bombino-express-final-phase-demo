import { useState, useEffect } from 'react';
import { ArrowLeft, Phone, Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';
import bombinoLogo from '@/assets/bombino-logo.png';

const RESEND_COOLDOWN_SECONDS = 30;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const { toast } = useToast();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const redirect = new URLSearchParams(window.location.search).get('redirect');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const requestOtp = async (): Promise<void> => {
    setIsLoading(true);
    setError('');
    setNoAccount(false);
    try {
      await apiRequest('POST', '/api/auth/otp/request', { phone, purpose: 'login' });
      setStep('otp');
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast({ title: 'OTP sent', description: `Sent to ${phone}` });
    } catch (err) {
      setError(parseApiErrorMessage(err, 'Could not send OTP'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = (): void => {
    if (!/^\d{10}$/.test(phone.trim())) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    void requestOtp();
  };

  const handleResendOtp = (): void => {
    if (cooldown > 0) return;
    void requestOtp();
  };

  const handleVerify = async (): Promise<void> => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code');
      return;
    }
    setIsLoading(true);
    setError('');
    setNoAccount(false);
    try {
      await apiRequest('POST', '/api/auth/otp/verify', { phone, purpose: 'login', code: otp });
      const res = await apiRequest('POST', '/api/auth/login/otp', { phone });
      const user = (await res.json()) as AuthUser;
      login(user);
      setLocation(redirect || '/home');
    } catch (err) {
      if (err instanceof Error && /^404:/.test(err.message)) {
        setNoAccount(true);
        setError('No account found for this number.');
      } else {
        setError(parseApiErrorMessage(err, 'Incorrect code'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await apiRequest('POST', '/api/auth/login', { email: email.trim(), password });
      const user = (await res.json()) as AuthUser;
      login(user);
      setLocation(redirect || '/home');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message.replace(/^\d+:\s*/, ''));
    } finally {
      setIsLoading(false);
    }
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
            {mode === 'otp' ? (
              <>
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
                    <div className="mt-3 flex justify-center">
                      <InputOTP maxLength={6} value={otp} onChange={(v) => { setOtp(v); setError(''); setNoAccount(false); }}>
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot key={i} index={i} className="h-12 w-11 text-base" data-testid={`input-otp-slot-${i}`} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
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

                {error && (
                  <p className="text-sm text-red-500 text-center">
                    {error}
                    {noAccount && (
                      <>
                        {' '}
                        <Link
                          href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'}
                          className="text-[#F2A123] font-semibold hover:underline"
                        >
                          Create one
                        </Link>
                      </>
                    )}
                  </p>
                )}

                <Button
                  onClick={step === 'phone' ? handleSendOtp : () => void handleVerify()}
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
              </>
            ) : (
              <>
                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Email</Label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                      placeholder="Enter your email"
                      className="pl-10 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-[lab(34.0831_-9.57756_-27.7093)]">Password</Label>
                  <div className="relative mt-2">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                      placeholder="Enter your password"
                      className="pl-10 pr-12 h-12 bg-[#F3F4F6] border border-[#E2E8F0] rounded-xl"
                      autoComplete="current-password"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                <Button
                  onClick={handlePasswordSubmit}
                  disabled={isLoading}
                  className="w-full h-12 text-base font-semibold bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] rounded-xl shadow-[0_4px_20px_oklch(17%_0.048_248_/_0.10)] disabled:opacity-70 mt-1"
                  data-testid="button-sign-in-password"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                </Button>
              </>
            )}

            <button
              type="button"
              onClick={() => { setMode((m) => (m === 'otp' ? 'password' : 'otp')); setError(''); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-[#F2A123] transition-colors"
              data-testid="button-toggle-login-mode"
            >
              {mode === 'otp' ? 'Sign in with email & password instead' : 'Use phone OTP instead'}
            </button>
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
