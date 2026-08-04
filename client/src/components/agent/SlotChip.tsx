import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneForDate } from '@/lib/agentGrouping';

/**
 * The pickup window, promoted out of the metadata line.
 *
 * It used to sit at 12px next to the weight, which is where an agent looked
 * last and needed first: the window is the appointment, and being early or
 * late to it is the whole job. As a chip it is the second thing read after the
 * name, and it carries the urgency colour so "3 Aug, already gone" and
 * "7 Aug, not yet" are distinguishable without reading the date at all.
 *
 * Colour comes from `toneForDate`, so the chip and the card it sits on can
 * never disagree about how urgent the job is.
 */
export function SlotChip({
  pickupDate,
  pickupSlot,
  className,
}: {
  pickupDate: string | null;
  pickupSlot: string | null;
  className?: string;
}) {
  const tone = toneForDate(pickupDate);

  const when = pickupDate
    ? new Date(`${pickupDate}T00:00:00Z`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 h-9 px-3 rounded-lg border-2 max-w-full',
        tone.slot,
        className,
      )}
      data-testid="slot-chip"
    >
      <Clock className={cn('w-4 h-4 shrink-0', tone.slotIcon)} strokeWidth={2.5} />
      <span className="text-[13px] font-extrabold tabular-nums truncate">
        {when && pickupSlot ? `${when} · ${pickupSlot}` : (when ?? pickupSlot ?? 'No window set')}
      </span>
    </span>
  );
}
