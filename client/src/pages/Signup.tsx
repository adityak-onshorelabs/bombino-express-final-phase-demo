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
