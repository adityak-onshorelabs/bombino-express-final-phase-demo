import { Loader2, PackageSearch, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AgentShell } from '@/components/agent/AgentShell';
import { PickupCard } from '@/components/agent/PickupCard';
import { ActionButtons } from '@/components/agent/ActionButtons';
import { BandHeader } from '@/components/agent/BandHeader';
import { BAND_LABEL, groupByDate, isUrgentBand } from '@/lib/agentGrouping';
import { useAvailablePickups, useOrderAction } from '@/hooks/useAgentPickups';

/**
 * A5 screen 1 — jobs nobody has claimed, segregated by when they are due.
 *
 * Flat FIFO order was right for fairness and wrong for reading: an agent
 * scanning for work today had to read the date on every card to find out
 * whether it was even relevant, and a job overdue since yesterday sat wherever
 * the queue happened to put it. Bands answer that before the agent reads a
 * single card.
 *
 * Within a band the queue is still oldest-first, so nothing rots at the bottom
 * of the list — the fairness the FIFO ordering existed for is untouched.
 *
 * The claim button stays on the card rather than behind a detail screen: an
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

  const bands = groupByDate(pickups ?? []);

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

      {!isLoading && !isError && bands.length > 0 && (
        <div className="space-y-7">
          {bands.map(({ band, entries }) => (
            <section key={band}>
              <BandHeader
                label={BAND_LABEL[band]}
                count={entries.length}
                urgent={isUrgentBand(band)}
                testId={`band-${band}`}
              />
              <div className="space-y-3">
                {entries.map(({ order, availableActions }) => (
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
            </section>
          ))}
        </div>
      )}
    </AgentShell>
  );
}
