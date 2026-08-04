import { cn } from '@/lib/utils';

/**
 * The rule between two groups of jobs.
 *
 * A label, a hairline that runs the width the cards run, and a count. The
 * hairline does the segregating: without it, two stacks of white cards under
 * two small labels read as one long list, which is the failure this replaced.
 *
 * Urgency is weight, not colour. An overdue band gets full-strength foreground
 * text against the muted default; nothing here reaches for a hue, because on
 * the agent surface a colour would read as money (PRODUCT.md).
 */
export function BandHeader({
  label,
  count,
  urgent = false,
  action,
  testId,
}: {
  label: string;
  count?: number;
  urgent?: boolean;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2.5" data-testid={testId}>
      <h2
        className={cn(
          'text-[11px] uppercase tracking-[0.14em] font-bold shrink-0',
          urgent ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </h2>
      <span
        className={cn('h-px flex-1', urgent ? 'bg-foreground/25' : 'bg-border')}
        aria-hidden
      />
      {count !== undefined && (
        <span
          className={cn(
            'text-[11px] font-bold tabular-nums shrink-0',
            urgent ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
      {action}
    </div>
  );
}
