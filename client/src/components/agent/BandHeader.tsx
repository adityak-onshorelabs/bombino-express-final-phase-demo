import type * as React from 'react';
import { cn } from '@/lib/utils';
import { toneForBand, type DateBand } from '@/lib/agentGrouping';

/**
 * The rule between two groups of jobs.
 *
 * A mono label, a hairline that runs the rest of the row, and a count. The
 * hairline does the segregating: without it, two stacks of white panels under
 * two small labels read as one long list.
 *
 * Urgency is weight and hairline strength, not a palette. The one band that
 * takes a hue is overdue, in the red the colour law reserves for late — a band
 * head is the first thing read on the screen, and an overdue band that looked
 * like every other band is the failure this exists to prevent.
 */
export function BandHeader({
  label,
  count,
  band = 'today',
  action,
  testId,
}: {
  label: string;
  count?: number;
  /** Drives the label colour and the hairline. Defaults to the neutral rule. */
  band?: DateBand;
  action?: React.ReactNode;
  testId?: string;
}) {
  const tone = toneForBand(band);
  const isOverdue = band === 'overdue';

  return (
    <div className="flex items-center gap-2.5 mb-2" data-testid={testId}>
      <h2
        className={cn(
          'font-mono text-[10px] uppercase tracking-[0.16em] shrink-0',
          isOverdue ? 'font-bold' : 'font-semibold',
          tone.head,
        )}
      >
        {label}
      </h2>
      <span className={cn('h-px flex-1', tone.rule)} aria-hidden />
      {count !== undefined && (
        <span
          className={cn(
            'font-mono text-[10px] tabular-nums shrink-0',
            isOverdue ? 'font-bold text-[#B91C1C]' : 'font-semibold text-[#64748B]',
          )}
        >
          {count}
        </span>
      )}
      {action}
    </div>
  );
}
