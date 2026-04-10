import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const entryClass =
  'bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs rounded-full px-2.5 py-0.5';

const transitClass =
  'bg-blue-50 text-blue-700 border border-blue-200 font-medium text-xs rounded-full px-2.5 py-0.5';

const deliveredClass =
  'bg-green-50 text-green-700 border border-green-200 font-medium text-xs rounded-full px-2.5 py-0.5';

const cancelledClass =
  'bg-red-50 text-red-700 border border-red-200 font-medium text-xs rounded-full px-2.5 py-0.5';

const defaultClass =
  'bg-gray-50 text-gray-600 border border-gray-200 font-medium text-xs rounded-full px-2.5 py-0.5';

function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, '_');
}

function badgeClassForStatus(status: string): string {
  const n = normalizeStatusKey(status);
  if (n === 'entry') return entryClass;
  if (n === 'in_transit' || n === 'transit') return transitClass;
  if (n === 'delivered') return deliveredClass;
  if (n === 'cancelled' || n === 'canceled') return cancelledClass;
  return defaultClass;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center', badgeClassForStatus(status), className)}
      data-testid={`status-badge-${status.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {status}
    </span>
  );
}
