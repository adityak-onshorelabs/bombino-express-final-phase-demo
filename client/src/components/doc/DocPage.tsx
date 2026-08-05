import type { ReactNode } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page chrome for the Freight Document language, shared by every app screen.
 *
 * Deliberately the same construction as `AuthShell`: sticky header with a mono
 * uppercase title, content on a white page divided by hairline rules, no
 * floating cards and no blur shadows. Auth and the rest of the app are one
 * product, so they get one frame — the previous split (marketing-style Home,
 * form-style Rates, document-style auth) is what read as three products.
 */
export function DocPage({
  title,
  eyebrow,
  onMenuClick,
  onBack,
  headerRight,
  children,
  className,
  testId,
}: {
  /** Text, or a node when the brand mark should stand in for a page name. */
  title: ReactNode;
  /**
   * Small line above the title — a greeting, a section, a status.
   *
   * Two lines rather than one long string because the header has roughly 260px
   * of usable width at the mono tracked size, and "GOOD AFTERNOON, RAJESHWARI"
   * does not fit. Stacking keeps the greeting and any length of name legible.
   */
  eyebrow?: string;
  /** Shows a hamburger. Mutually exclusive with onBack. */
  onMenuClick?: () => void;
  /** Shows a back arrow. Takes precedence over onMenuClick. */
  onBack?: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn('doc-surface pb-nav', className)} data-testid={testId}>
      <header className="sticky top-0 z-20 bg-card border-b border-border safe-top">
        <div className="flex items-center h-14 px-5 max-w-md mx-auto">
          {onBack ? (
            <button
              onClick={onBack}
              className="tap-target focus-ring -ml-2 hover:bg-muted transition-colors"
              style={{ borderRadius: 'var(--doc-radius)' }}
              aria-label="Go back"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : onMenuClick ? (
            <button
              onClick={onMenuClick}
              className="tap-target focus-ring -ml-2 hover:bg-muted transition-colors"
              style={{ borderRadius: 'var(--doc-radius)' }}
              aria-label="Open menu"
              data-testid="button-menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : null}
          <div className="ml-1 min-w-0">
            {eyebrow && (
              <p
                className="doc-mono text-[10px] uppercase text-muted-foreground leading-none"
                style={{ letterSpacing: '0.14em' }}
              >
                {eyebrow}
              </p>
            )}
            <h1
              className={cn(
                'doc-mono text-xs font-semibold uppercase text-foreground truncate',
                eyebrow && 'mt-1',
              )}
              style={{ letterSpacing: '0.14em' }}
            >
              {title}
            </h1>
          </div>
          {headerRight && <div className="ml-auto flex items-center">{headerRight}</div>}
        </div>
      </header>

      <main className="px-5 py-6">
        <div className="max-w-md mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}

/**
 * A titled block. The label is the same mono uppercase micro-label the auth
 * fields use, so a section header and a field label read as the same system.
 */
export function DocSection({
  label,
  action,
  children,
  className,
}: {
  label: string;
  /** Optional trailing link, e.g. "View all". */
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-7 first:mt-0', className)}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="doc-label">{label}</h2>
        {action && (
          <Link href={action.href} className="doc-link focus-ring shrink-0">
            {action.label}
            <ArrowRight className="w-3 h-3 shrink-0" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * A ruled group of rows — the `.doc-choice-group` pattern from the account
 * fork, reused for any list of tappable items. Frame and dividers come from a
 * background plus 1px gaps, which stay crisp at fractional device-pixel ratios
 * where a 1px border rounds away.
 */
export function DocRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('doc-choice-group', className)}>{children}</div>;
}
