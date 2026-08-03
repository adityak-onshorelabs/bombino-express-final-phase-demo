import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AvailableAction } from '@shared/orderContract';

/**
 * Renders one button per entry in `availableActions` and nothing else.
 *
 * Holds NO lifecycle knowledge: not which action follows which, not who may
 * perform what, not what any status means. The server sends the list. Adding a
 * transition server-side makes a button appear here with no change to this
 * file — that is the point of the uniform action endpoint.
 *
 * Actions that need input are not handled inline. The parent owns that: it
 * receives the action name and opens whatever surface the input belongs in
 * (payment gets a bottom sheet). Keeping that out of here is what stops this
 * component accumulating per-action special cases.
 *
 * 56px tall, per the field-conditions requirement in PRODUCT.md — above the
 * 44px baseline, because these are pressed with gloves on.
 */
export function ActionButtons({
  actions,
  onAction,
  pendingAction,
  disabled = false,
}: {
  actions: AvailableAction[];
  onAction: (action: string) => void;
  /** Action in flight, so only its own button shows a spinner. */
  pendingAction?: string | null;
  disabled?: boolean;
}) {
  if (actions.length === 0) {
    return (
      <p
        className="text-sm font-semibold text-muted-foreground text-center py-3"
        data-testid="no-actions"
      >
        Nothing to do here.
      </p>
    );
  }

  return (
    <div className="space-y-2.5" data-testid="action-buttons">
      {actions.map(({ action, label }, index) => {
        const isPending = pendingAction === action;
        // The first action is the expected next step and gets the weight. Any
        // others are alternatives (cancel, collect) and must not compete with
        // it — an agent glancing down should see one obvious move.
        const isPrimary = index === 0;

        return (
          <button
            key={action}
            type="button"
            onClick={() => onAction(action)}
            disabled={disabled || isPending}
            className={cn(
              'w-full h-14 rounded-xl text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60 grid place-items-center',
              isPrimary
                ? 'bg-primary text-white'
                : 'bg-white text-foreground border-2 border-border',
            )}
            data-testid={`button-action-${action}`}
          >
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : label}
          </button>
        );
      })}
    </div>
  );
}
