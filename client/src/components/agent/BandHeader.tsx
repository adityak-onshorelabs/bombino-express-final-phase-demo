import { cn } from '@/lib/utils';
import type { DateBand } from '@/lib/agentGrouping';

/**
 * The label over a group of jobs: `Doing now`, `New jobs`, `Late`, `Today`,
 * `Later`, `Taken today`.
 *
 * A plain uppercase label and nothing else. The hairline that used to run
 * beside it is gone: cards are separate objects with their own borders now, so
 * the group already reads as a group and the rule was one more line on a screen
 * that has enough.
 *
 * No count. Screen subtitles carry one, and two numbers on one screen that
 * could ever disagree is worse than neither. The one exception is the New jobs
 * rail, whose chip counts the cards beside it and is rendered there.
 *
 * Urgency is colour, and only for late — the band head is the first thing read
 * on the screen, and a late band that looked like every other band is the
 * failure this exists to prevent.
 */
export function BandHeader({
  label,
  band = 'today',
  testId,
}: {
  label: string;
  /** Only `overdue` changes anything: it turns the label red. */
  band?: DateBand;
  testId?: string;
}) {
  return (
    <h2
      className={cn(
        'text-xs font-bold uppercase tracking-[0.14em] mb-3',
        band === 'overdue' ? 'text-[#B91C1C]' : 'text-[#64748B]',
      )}
      data-testid={testId}
    >
      {label}
    </h2>
  );
}
