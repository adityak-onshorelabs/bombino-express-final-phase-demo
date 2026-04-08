import { ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import bombinoLogo from '@/assets/image_1768167970562.png';

export default function Signup() {
  const [, setLocation] = useLocation();

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
          <h1 className="ml-2 font-semibold">Get Started</h1>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="flex flex-col items-center mb-8">
          <img
            src={bombinoLogo}
            alt="Bombino Express"
            className="h-24 w-auto mb-6 max-w-[200px] object-contain"
          />
          <h2 className="text-xl font-semibold text-foreground text-center">
            Get Started with Bombino Express
          </h2>
          <p className="text-sm text-muted-foreground mt-3 text-center max-w-sm">
            To create your account, send your KYC documents to our team and we&apos;ll have you set up
            within 24 hours.
          </p>
        </div>

        <div className="space-y-3 max-w-md mx-auto">
          <a
            href="mailto:bombino@bombinoexp.com"
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-white hover:bg-muted/30 transition-colors"
          >
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Email us</p>
              <p className="font-medium text-sm text-foreground break-all">
                bombino@bombinoexp.com
              </p>
            </div>
          </a>

          <a
            href="https://api.whatsapp.com/send?phone=917045999553"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-white hover:bg-muted/30 transition-colors"
          >
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">WhatsApp us</p>
              <p className="font-medium text-sm text-foreground">+91 70459 99553</p>
            </div>
          </a>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
