import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { formatInrShort, formatKg, nextTier, tierById, type TierId } from '@/lib/rewards';
import { prefersReducedMotion } from '@/hooks/useCountUp';
import { TierEmblem } from './TierEmblem';

interface TierUpCelebrationProps {
  tierId: TierId | null;
  onClose: () => void;
}

/**
 * The tier-up moment: the one place in rewards that gets to be loud. A navy
 * scrim, the new badge springing in, and amber-and-white confetti. With
 * reduced motion it skips the confetti and the spring.
 */
export function TierUpCelebration({ tierId, onClose }: TierUpCelebrationProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const tier = tierId ? tierById(tierId) : null;
  const upcoming = tier ? nextTier(tier) : null;

  useEffect(() => {
    if (!tier) return;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    let second = 0;
    if (!prefersReducedMotion()) {
      const fire = (x: number): void => {
        void confetti({
          particleCount: 90,
          spread: 75,
          startVelocity: 45,
          origin: { x, y: 0.55 },
          colors: ['#F2A123', '#F7C35C', '#FFFFFF', '#2F4468'],
          zIndex: 70,
        });
      };
      fire(0.3);
      second = window.setTimeout(() => fire(0.7), 220);
    }

    return () => {
      window.clearTimeout(second);
      window.removeEventListener('keydown', onKey);
    };
  }, [tier, onClose]);

  return (
    <AnimatePresence>
      {tier && (
        <motion.div
          key={tier.id}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0C1A25]/85 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tier-up-title"
          data-testid="tier-up-celebration"
        >
          <motion.div
            className="relative w-full max-w-sm overflow-hidden rounded-lg bg-gradient-to-b from-[#22365A] to-[#0C1A25] px-6 pb-6 pt-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {/* Rays behind the badge. */}
            <div
              className="pointer-events-none absolute left-1/2 top-4 h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(242,161,35,0.35)_0%,rgba(242,161,35,0)_65%)]"
              aria-hidden
            />
            <motion.div
              className="relative mx-auto w-fit"
              initial={{ scale: 0.3, rotate: -18 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.1 }}
            >
              <TierEmblem tier={tier} size={112} />
            </motion.div>

            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F7C35C]">Tier unlocked</p>
            <h2 id="tier-up-title" className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight text-white">
              Welcome to {tier.name}
            </h2>
            <p className="mx-auto mt-2 max-w-[17rem] text-sm leading-relaxed text-white/70">
              You crossed {formatInrShort(tier.value)} billed or {formatKg(tier.weightKg)} shipped this year.
            </p>

            {upcoming ? (
              <div className="mt-5 rounded-md bg-white/[0.06] px-4 py-3 text-left ring-1 ring-white/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">Next up</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {upcoming.name}: {formatInrShort(upcoming.value)} or {formatKg(upcoming.weightKg)}
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-md bg-[#F2A123]/10 px-4 py-3 text-sm font-semibold text-[#F7C35C] ring-1 ring-[#F2A123]/30">
                This is the top tier.
              </div>
            )}

            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="mt-6 h-12 w-full rounded-md bg-[#F2A123] text-sm font-bold text-[#1B2A44] shadow-[0_8px_24px_rgba(242,161,35,0.35)] transition-transform hover:bg-[#F7B03F] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F2A123]/40"
              data-testid="button-tier-up-close"
            >
              Keep shipping
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
