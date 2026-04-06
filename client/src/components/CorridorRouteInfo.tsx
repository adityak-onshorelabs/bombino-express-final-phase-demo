import { cn } from '@/lib/utils';

interface CorridorRouteInfoProps {
  className?: string;
  /** Smaller type for compact cells (e.g. rate results summary). */
  compact?: boolean;
  /** No card chrome — use inside another container (e.g. summary grid cell). */
  bare?: boolean;
}

export function CorridorRouteInfo({ className, compact, bare }: CorridorRouteInfoProps) {
  return (
    <div
      className={cn(
        !bare && 'bg-card rounded-xl border border-border p-4 shadow-sm',
        !bare && compact && 'p-3 shadow-none',
        bare && 'p-0',
        className
      )}
    >
      <p
        className={cn(
          'font-semibold text-foreground',
          compact ? 'text-[10px] leading-tight' : 'text-sm'
        )}
      >
        India → United States
      </p>
      <p
        className={cn(
          'text-muted-foreground mt-1',
          compact ? 'text-[9px] leading-tight' : 'text-xs'
        )}
      >
        More corridors coming soon
      </p>
    </div>
  );
}
