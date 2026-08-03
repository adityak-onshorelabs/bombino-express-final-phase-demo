import { Loader2, ClipboardList, AlertTriangle } from 'lucide-react';
import { AgentShell } from '@/components/agent/AgentShell';
import { PickupCard } from '@/components/agent/PickupCard';
import { useMyPickups } from '@/hooks/useAgentPickups';

/**
 * A5 screen 2 — the agent's own live jobs.
 *
 * Cards navigate to the detail screen rather than carrying their action
 * buttons inline. Unlike accepting, the field actions ("picked up", "received
 * at hub") are consequential and some need the address and contact in front of
 * you first — so they belong on a screen that shows them.
 *
 * A job leaves this list at `received_at_hub`. That is the handoff to ops and
 * it is one-directional: the server stops returning it, so it simply
 * disappears on the next refetch.
 */
export default function MyPickups() {
  const { data: pickups, isLoading, isError, refetch } = useMyPickups();

  return (
    <AgentShell title="My pickups" subtitle="Jobs you have accepted">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading your pickups…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center text-center py-16 px-4">
          <AlertTriangle className="w-8 h-8 text-red-600 mb-3" />
          <p className="text-base font-extrabold text-foreground">Could not load your pickups</p>
          <p className="text-sm font-medium text-muted-foreground mt-1 mb-4">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm font-bold text-primary"
            data-testid="button-retry-mine"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && pickups?.length === 0 && (
        <div className="flex flex-col items-center text-center py-16 px-4" data-testid="empty-mine">
          <ClipboardList className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-base font-extrabold text-foreground">No pickups accepted</p>
          <p className="text-sm font-medium text-muted-foreground mt-1">
            Accept a job from Available to see it here.
          </p>
        </div>
      )}

      {!isLoading && !isError && pickups && pickups.length > 0 && (
        <div className="space-y-3">
          {pickups.map(({ order }) => (
            <PickupCard key={order.id} pickup={order} href={`/agent/pickup/${order.id}`} />
          ))}
        </div>
      )}
    </AgentShell>
  );
}
