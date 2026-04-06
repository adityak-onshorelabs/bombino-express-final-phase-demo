import { useState } from 'react';
import { ArrowLeft, Key } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore, type AuthUser } from '@/lib/store';
import bombinoLogo from '@assets/generated_images/bombino_express_logo_design.png';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const [step, setStep] = useState<'form' | 'otp'>('form');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOTP, setGeneratedOTP] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    const newOTP = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOTP(newOTP);
    setStep('otp');
    setError('');
  };

  const handleVerifyOTP = () => {
    if (otp === generatedOTP) {
      const newUser: AuthUser = {
        id: `user-${Math.random().toString(36).slice(2)}`,
        customerId: '',
        code: '',
        email,
        fullName: `${firstName} ${lastName}`,
        username: email,
        role: 'customer',
      };
      login(newUser);
      setLocation('/home');
    } else {
      setError('Invalid OTP. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom" data-testid="screen-signup">
      <header className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => setLocation('/home')}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back-signup"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="ml-2 font-semibold">Create Account</h1>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="flex flex-col items-center mb-6">
          <img src={bombinoLogo} alt="Bombino Express" className="h-12 w-auto mb-2" />
          <p className="text-sm text-muted-foreground">Bringing the world closer</p>
        </div>

        {step === 'form' ? (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">First Name *</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="h-12 mt-1"
                  data-testid="input-firstname"
                />
              </div>
              <div>
                <Label className="text-sm">Last Name *</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="h-12 mt-1"
                  data-testid="input-lastname"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="h-12 mt-1"
                data-testid="input-signup-email"
              />
            </div>

            <div>
              <Label className="text-sm">Mobile Number *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555-123-4567"
                className="h-12 mt-1"
                data-testid="input-signup-phone"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              onClick={handleSubmit}
              className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 mt-6"
              data-testid="button-signup-submit"
            >
              Continue
            </Button>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-sm text-emerald-700">Demo OTP (enter this code):</p>
              <p className="text-3xl font-bold text-emerald-700 tracking-widest mt-2">
                {generatedOTP}
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium">Enter OTP</Label>
              <div className="relative mt-2">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="6-digit OTP"
                  className="pl-10 h-14 text-center text-xl tracking-widest"
                  maxLength={6}
                  data-testid="input-signup-otp"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              onClick={handleVerifyOTP}
              disabled={otp.length !== 6}
              className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 disabled:opacity-50"
              data-testid="button-signup-verify"
            >
              Verify & Create Account
            </Button>

            <button
              onClick={() => {
                setStep('form');
                setOtp('');
                setError('');
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Go back
            </button>
          </div>
        )}
      </main>
    </div>
  );
}