import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The three "nothing to show here" states, in one place.
 *
 * Before this, a signed-out customer met three different screens for one
 * situation — /home said "Sign in to manage your shipments" with a Login/Sign
 * Up pair, /orders said "Sign in to view your shipments" with a navy button,
 * and /create said "Please login to continue" with an amber one. Three
 * layouts, three copy variants, two button colours, one situation.
 */

interface StateBlockProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Primary action. Amber — one per screen. */
  action?: { label: string; onClick: () => void };
  /** Optional second action. Never amber; see .doc-btn-quiet. */
  secondaryAction?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
  testId?: string;
}

export function StateBlock({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
  testId,
}: StateBlockProps) {
  return (
    <div
      className={cn('flex flex-col items-center text-center px-6 py-14', className)}
      data-testid={testId}
    >
      {Icon && (
        <div
          className="w-11 h-11 flex items-center justify-center border border-border bg-muted mb-4"
          style={{ borderRadius: 'var(--doc-radius)' }}
        >
          <Icon className="w-5 h-5 text-muted-foreground" aria-hidden />
        </div>
      )}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-6">
          {action && (
            <Button
              onClick={action.onClick}
              className="doc-btn-cta h-11 px-6"
              data-testid="button-state-action"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              className="doc-btn-quiet h-11 px-6"
              data-testid="button-state-secondary"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The signed-out case specifically. Wraps StateBlock so every screen that
 * needs a login wall words it the same way and sends the customer back where
 * they were afterwards.
 */
export function SignedOutState({
  icon,
  title = 'Sign in to continue',
  description,
  redirectTo,
  testId,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  /** Path to return to after signing in. */
  redirectTo: string;
  testId?: string;
}) {
  const [, setLocation] = useLocation();
  const go = (path: string) =>
    setLocation(`${path}?redirect=${encodeURIComponent(redirectTo)}`);

  return (
    <StateBlock
      icon={icon}
      title={title}
      description={description}
      action={{ label: 'Sign in', onClick: () => go('/login') }}
      secondaryAction={{ label: 'Create account', onClick: () => go('/signup') }}
      testId={testId ?? 'state-signed-out'}
    />
  );
}
