import { useId } from 'react';
import { Crown, Lock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tier, TierId } from '@/lib/rewards';

/**
 * A tier's badge: a hexagon that gets richer as the ladder climbs. Standard is
 * slate, the middle tiers warm through Dispatch Amber, and the top two turn to
 * Admiralty navy with an amber rim. That keeps the look on brand while still
 * reading as a progression.
 */
const LOOK: Record<TierId, { from: string; to: string; rim: string; ink: string }> = {
  standard: { from: '#F1F5F9', to: '#CBD5E1', rim: '#94A3B8', ink: '#334155' },
  t1: { from: '#FFF4DF', to: '#F9CF86', rim: '#E3A23A', ink: '#7A4B00' },
  t2: { from: '#FBD38D', to: '#F2A123', rim: '#C77A0A', ink: '#4A2E00' },
  t3: { from: '#F2A123', to: '#C9700A', rim: '#8F4F05', ink: '#FFFFFF' },
  t4: { from: '#3A5683', to: '#1B2A44', rim: '#F2A123', ink: '#F7C35C' },
  t5: { from: '#22365A', to: '#0C1A25', rim: '#F7C35C', ink: '#F7C35C' },
};

const OUTER = '50,3 92,27 92,73 50,97 8,73 8,27';
const INNER = '50,12 84,31.5 84,68.5 50,88 16,68.5 16,31.5';

interface TierEmblemProps {
  tier: Tier;
  size?: number;
  locked?: boolean;
  className?: string;
}

export function TierEmblem({ tier, size = 56, locked = false, className }: TierEmblemProps) {
  const gradientId = useId();
  const look = LOOK[tier.id];
  const glyph = Math.round(size * 0.38);

  return (
    <div
      className={cn('relative shrink-0 select-none', locked && 'grayscale opacity-45', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${tier.name} badge${locked ? ', locked' : ''}`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-[0_4px_10px_oklch(17%_0.048_248/0.18)]">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={look.from} />
            <stop offset="100%" stopColor={look.to} />
          </linearGradient>
        </defs>
        <polygon points={OUTER} fill={look.rim} />
        <polygon points={INNER} fill={`url(#${gradientId})`} />
        {/* A soft highlight across the upper half, so it reads as a badge, not a flat shape. */}
        <polygon points="50,12 84,31.5 84,46 16,46 16,31.5" fill="#FFFFFF" opacity="0.14" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color: look.ink }}>
        {tier.id === 'standard' ? (
          <Star style={{ width: glyph, height: glyph }} strokeWidth={2.4} fill="currentColor" />
        ) : tier.id === 't5' ? (
          <Crown style={{ width: glyph, height: glyph }} strokeWidth={2.2} fill="currentColor" />
        ) : (
          <span className="font-extrabold leading-none tabular-nums" style={{ fontSize: Math.round(size * 0.42) }}>
            {tier.rank}
          </span>
        )}
      </div>
      {locked && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-[#E2E8F0]">
          <Lock className="h-3 w-3 text-[#64748B]" />
        </span>
      )}
    </div>
  );
}
