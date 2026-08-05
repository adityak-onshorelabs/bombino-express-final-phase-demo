import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import bombinoLogo from '@/assets/bombino-logo.png';

interface AuthShellProps {
  /** Sets the header label AND the page heading — they were separate strings
   *  saying the same word ("Sign In" twice, stacked) before this. */
  title: string;
  /** One line of orientation for the current step. Replaces the fixed
   *  "Bringing the world closer" tagline, which said nothing on the OTP,
   *  account-fork and linking steps where it still appeared.
   *
   *  ReactNode rather than string so callers can set the customer's number in
   *  mono — every other number on these screens is set that way, and a phone
   *  buried in running body text was the one place it wasn't. */
  subtitle?: ReactNode;
  onBack: () => void;
  /** 1-based position in the flow. Omit for single-step screens. */
  step?: number;
  totalSteps?: number;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}

/** "3" → "03". Docket numbers are zero-padded; a bare 3 is not. */
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Common frame for every authentication screen — "Freight Document" language.
 *
 * Deliberately not the app's usual soft-card treatment. Content sits directly
 * on the page and is divided by hairline rules, the way a printed form is:
 * no floating panel, no blurred shadow, near-square corners. Progress is a
 * mono counter ("01 / 03") rather than dots, because a number is what a
 * waybill would show and it is also more precise.
 *
 * Everything is left-aligned. The previous centred column read as a generic
 * template and pushed the first field further from the thumb.
 */
export function AuthShell({
  title,
  subtitle,
  onBack,
  step,
  totalSteps,
  children,
  footer,
  testId,
}: AuthShellProps) {
  const showProgress =
    typeof step === 'number' && typeof totalSteps === 'number' && totalSteps > 1;

  return (
    <div className="doc-surface min-h-[100dvh] bg-card safe-top safe-bottom" data-testid={testId}>
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="flex items-center h-14 px-5 max-w-md mx-auto">
          <button
            onClick={onBack}
            className="tap-target focus-ring -ml-2 hover:bg-muted transition-colors"
            style={{ borderRadius: 'var(--doc-radius)' }}
            aria-label="Go back"
            data-testid="button-back-auth"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1
            className="doc-mono ml-1 text-xs font-semibold uppercase text-foreground"
            style={{ letterSpacing: '0.14em' }}
          >
            {title}
          </h1>
          {showProgress && (
            <span
              className="doc-mono ml-auto text-xs text-muted-foreground"
              aria-label={`Step ${step} of ${totalSteps}`}
            >
              {pad(step)} <span className="text-border">/</span> {pad(totalSteps)}
            </span>
          )}
        </div>
      </header>

      <main className="px-5 py-8">
        <div className="max-w-md mx-auto w-full">
          {/* Wordmark over a heavy rule — the masthead of the document. */}
          <img
            src={bombinoLogo}
            alt="Bombino Express"
            className="h-auto w-[132px] object-contain"
          />
          <div className="doc-rule-heavy mt-4" />

          {subtitle && (
            <p className="mt-6 text-[15px] leading-relaxed text-foreground text-balance">
              {subtitle}
            </p>
          )}

          <div className="mt-7 space-y-6 animate-fade-in">{children}</div>

          {footer}

          <div className="doc-rule mt-8 pt-4">
            <p className="doc-label text-[10px]">
              <a
                href="/privacy"
                className="hover:text-accent underline underline-offset-4 rounded focus-ring"
              >
                Privacy Policy
              </a>
              <span className="mx-2 text-border">·</span>
              Bombino Express
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
