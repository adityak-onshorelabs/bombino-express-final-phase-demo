import { useState } from 'react';
import { ArrowLeft, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore, type AuthUser } from '@/lib/store';
import { apiRequest } from '@/lib/queryClient';
import bombinoLogo from '@/assets/image_1768167970562.png';

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
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
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || '/home';
      setLocation(redirect);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      // Strip the leading status code if present (e.g. "401: Invalid credentials")
      setError(message.replace(/^\d+:\s*/, ''));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom" data-testid="screen-login">
      <header className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => setLocation('/home')}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back-login"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="ml-2 font-semibold">Sign In</h1>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="flex flex-col items-center mb-12">
          <img src={bombinoLogo} alt="Bombino Express" className="h-24 w-auto mb-6 max-w-[200px] object-contain" />
          <h2 className="text-xl font-semibold text-foreground">Sign In</h2>
          <p className="text-sm text-muted-foreground mt-1">Bringing the world closer</p>
        </div>

        <div className="space-y-6 animate-fade-in">
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Enter your email"
                className="pl-10 h-14"
                autoComplete="email"
                data-testid="input-email"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Password</Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Enter your password"
                className="pl-10 pr-12 h-14"
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
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 disabled:opacity-70"
            data-testid="button-sign-in"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Sign In'
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
