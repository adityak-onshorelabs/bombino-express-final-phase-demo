import { Loader2, PackageSearch, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AgentShell } from '@/components/agent/AgentShell';
import { PickupCard } from '@/components/agent/PickupCard';
import { ActionButtons } from '@/components/agent/ActionButtons';
import { useAvailablePickups, useOrderAction } from '@/hooks/useAgentPickups';

/**
 * A5 screen 1 — jobs nobody has claimed, oldest first.
 *
 * The claim button lives on the card rather than behind a detail screen: an
 * agent deciding whether to take a job needs one tap, not two, and a job can
 * be gone by the time a second screen loads.
 */
export default function AvailablePickups() {
  const { data: pickups, isLoading, isError, refetch } = useAvailablePickups();
  const action = useOrderAction();
  const { toast } = useToast();

  const handleAction = (orderId: string, actionName: string): void => {
    action.mutate(
      { orderId, action: actionName },
      {
        onSuccess: (result) => {
          toast({
            title: 'Pickup accepted',
            description: `${result.order.order_no} is now in My Pickups.`,
          });
        },
        onError: (err) => {
          // 409 is the expected outcome of a lost race, not a malfunction —
          // say so plainly rather than showing a generic failure.
          toast({
            title: err.status === 409 ? 'Someone got there first' : 'Could not accept',
            description: err.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <AgentShell title="Available pickups" subtitle="Tap a job to accept it">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading pickups…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center text-center py-16 px-4">
          <AlertTriangle className="w-8 h-8 text-red-600 mb-3" />
          <p className="text-base font-extrabold text-foreground">Could not load pickups</p>
          <p className="text-sm font-medium text-muted-foreground mt-1 mb-4">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm font-bold text-primary"
            data-testid="button-retry-available"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && pickups?.length === 0 && (
        <div
          className="flex flex-col items-center text-center py-16 px-4"
          data-testid="empty-available"
        >
          <PackageSearch className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-base font-extrabold text-foreground">No pickups available</p>
          <p className="text-sm font-medium text-muted-foreground mt-1">
            New jobs appear here as customers book them.
          </p>
        </div>
      )}

      {!isLoading && !isError && pickups && pickups.length > 0 && (
        <div className="space-y-3">
          {pickups.map(({ order, availableActions }) => (
            <PickupCard key={order.id} pickup={order}>
              <ActionButtons
                actions={availableActions}
                pendingAction={
                  action.isPending && action.variables?.orderId === order.id
                    ? action.variables.action
                    : null
                }
                disabled={action.isPending}
                onAction={(actionName) => handleAction(order.id, actionName)}
              />
            </PickupCard>
          ))}
        </div>
      )}
    </AgentShell>
  );
}
