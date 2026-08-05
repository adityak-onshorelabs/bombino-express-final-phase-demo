import { cn } from '@/lib/utils';

export interface DocStep {
  id: number;
  title: string;
}

/**
 * Progress through a multi-step flow, set as a document header.
 *
 * Replaces two separate implementations — a desktop segmented stepper with
 * numbered pills and connector lines, and a mobile row of icon tiles — that
 * rendered the same state twice in two visual languages and had to be kept in
 * sync by hand.
 *
 * One bar at every width. The counter reads as a document reference
 * ("STEP 02 / 04"), and the segmented rule beneath carries the progress.
 * Completed segments are navigable: the flow previously only allowed stepping
 * back one at a time, so returning from step 4 to step 1 to fix a typo took
 * three taps and three re-renders.
 */
export function DocStepper({
  steps,
  current,
  onStepSelect,
  className,
}: {
  steps: DocStep[];
  /** 1-based. */
  current: number;
  /** Called for completed steps only. Omit to disable back-navigation. */
  onStepSelect?: (id: number) => void;
  className?: string;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const activeTitle = steps.find((s) => s.id === current)?.title ?? '';

  return (
    <div className={cn('bg-card border-b border-border', className)}>
      <div className="max-w-md mx-auto px-5 py-3 md:max-w-6xl md:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="doc-label" data-testid="stepper-counter">
            Step {pad(current)} <span className="text-border">/</span> {pad(steps.length)}
          </p>
          <p className="doc-mono text-xs font-semibold uppercase text-foreground truncate"
             style={{ letterSpacing: '0.12em' }}>
            {activeTitle}
          </p>
        </div>

        <ol className="flex items-center gap-1 mt-2" aria-label="Progress">
          {steps.map((step) => {
            const isDone = current > step.id;
            const isActive = current === step.id;
            const canSelect = isDone && Boolean(onStepSelect);

            return (
              <li key={step.id} className="flex-1">
                <button
                  type="button"
                  disabled={!canSelect}
                  onClick={() => canSelect && onStepSelect?.(step.id)}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${step.id}, ${step.title}${
                    isDone ? ', completed' : isActive ? ', current' : ''
                  }`}
                  className={cn(
                    'block w-full h-1 transition-colors',
                    canSelect && 'cursor-pointer hover:opacity-70',
                    isDone || isActive ? 'bg-accent' : 'bg-border',
                  )}
                  data-testid={`stepper-segment-${step.id}`}
                />
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
