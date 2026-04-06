import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  'Pickup Scheduled': 'bg-blue-100 text-blue-700',
  'Picked Up': 'bg-blue-100 text-blue-700',
  'In Transit': 'bg-amber-100 text-amber-700',
  'Arrived at Hub': 'bg-amber-100 text-amber-700',
  'Customs Clearance': 'bg-purple-100 text-purple-700',
  'Customs Hold': 'bg-red-100 text-red-700',
  'Out for Delivery': 'bg-emerald-100 text-emerald-700',
  'Delivered': 'bg-green-100 text-green-700',
  'Exception': 'bg-red-100 text-red-700',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
        statusColors[status] || 'bg-gray-100 text-gray-700',
        className
      )}
      data-testid={`status-badge-${status.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {status}
    </span>
  );
}