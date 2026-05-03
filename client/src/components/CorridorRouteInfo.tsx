import { cn } from '@/lib/utils';
import { formatCountryDisplay, ITD_COUNTRY_MAP } from '@/lib/itdCountryData';

interface CorridorRouteInfoProps {
  className?: string;
  /** Smaller type for compact cells (e.g. rate results summary). */
  compact?: boolean;
  /** No card chrome — use inside another container (e.g. summary grid cell). */
  bare?: boolean;
  destinationCode?: string;
  destinationName?: string;
}

export function CorridorRouteInfo({
  className,
  compact,
  bare,
  destinationCode,
  destinationName,
}: CorridorRouteInfoProps) {
  const resolvedName =
    destinationName ??
    formatCountryDisplay(
      ITD_COUNTRY_MAP[destinationCode ?? 'US']?.name ?? 'United States'
    );

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
        India → {resolvedName}
      </p>
      {!destinationCode ? (
        <p
          className={cn(
            'text-muted-foreground mt-1',
            compact ? 'text-[9px] leading-tight' : 'text-xs'
          )}
        >
          More corridors coming soon
        </p>
      ) : null}
    </div>
  );
}
