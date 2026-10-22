import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  /** 0–1 */
  value: number;
  size?: number;
  stroke?: number;
  trackClassName?: string;
  barClassName?: string;
  children?: ReactNode;
  label: string;
}

/**
 * A circular meter that fills from empty on mount and then tracks `value`.
 * It animates stroke-dashoffset, so nothing reflows. motion-safe keeps it
 * still for reduced motion.
 */
export function ProgressRing({
  value,
  size = 112,
  stroke = 10,
  trackClassName = 'stroke-white/12',
  barClassName = 'stroke-[#F2A123]',
  children,
  label,
}: ProgressRingProps) {
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(drawn, 0), 1);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClassName} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className={cn(barClassName, 'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

interface PathBarProps {
  label: string;
  /** e.g. "₹4.62 L of ₹5 L" */
  detail: string;
  value: number;
  leading: boolean;
}

/**
 * One of the two routes to the next tier (billing or weight). The route that
 * is further along is drawn in amber and tagged, which is how the screen says
 * "whichever comes first" without spelling it out.
 */
export function PathBar({ label, detail, value, leading }: PathBarProps) {
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-white">
          {label}
          {leading && (
            <span className="rounded-sm bg-[#F2A123] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.08em] text-[#1B2A44]">
              Closest
            </span>
          )}
        </span>
        <span className="tabular-nums text-white/70">{detail}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm bg-white/12">
        <div
          className={cn(
            'h-full origin-left rounded-sm motion-safe:transition-transform motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]',
            leading ? 'bg-gradient-to-r from-[#F7C35C] to-[#F2A123]' : 'bg-white/45',
          )}
          style={{ transform: `scaleX(${Math.min(Math.max(drawn, 0), 1)})` }}
        />
      </div>
    </div>
  );
}
