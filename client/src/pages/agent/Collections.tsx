import { Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { AgentShell } from '@/components/agent/AgentShell';
import { useCollections } from '@/hooks/useAgentPickups';

/**
 * Every payment this agent has taken today, with its transaction id.
 *
 * Exists because a transaction id that only appears in a toast is useless
 * twenty minutes later. This is where an agent reconciles their pouch at the
 * end of a shift, and where they look when a customer rings the hub asking for
 * proof.
 *
 * Cash is separated from UPI at the top because only one of them is physically
 * in the agent's bag and has to be handed over.
 */
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function Collections() {
  const { data, isLoading, isError, refetch } = useCollections();

  return (
    <AgentShell title="Collected today" subtitle="Reconcile before you hand over">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center text-center py-20 px-4">
          <AlertTriangle className="w-8 h-8 text-red-600 mb-3" />
          <p className="text-base font-extrabold text-foreground">Could not load collections</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 text-sm font-bold text-primary"
            data-testid="button-retry-collections"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <div className="rounded-xl bg-[#F2A123] p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#1B2A41]">
              Cash on hand
            </p>
            <p className="text-5xl font-extrabold text-[#1B2A41] tabular-nums leading-none mt-1">
              ₹{data.totals.cash}
            </p>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1B2A41]/25">
              <span className="text-xs font-bold text-[#1B2A41] tabular-nums">
                ₹{data.totals.upi} by UPI
              </span>
              <span className="text-xs font-bold text-[#1B2A41] tabular-nums">
                ₹{data.totals.all} total
              </span>
            </div>
          </div>

          {data.collections.length === 0 ? (
            <div
              className="flex flex-col items-center text-center py-16 px-4"
              data-testid="empty-collections"
            >
              <Wallet className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-base font-extrabold text-foreground">Nothing collected yet</p>
              <p className="text-sm font-medium text-muted-foreground mt-1">
                Payments you take at the door appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.collections.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border-2 border-border bg-white p-4"
                  data-testid={`collection-${c.txn_id ?? c.id}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-2xl font-extrabold text-foreground tabular-nums leading-none">
                      ₹{c.amount}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground shrink-0">
                      {c.collection_mode === 'cash' ? 'Cash' : 'UPI'}
                    </p>
                  </div>

                  <p className="font-mono text-sm font-bold text-foreground mt-2">
                    {c.txn_id ?? 'No txn id'}
                  </p>

                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      {c.order_no ?? '—'}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatTime(c.collected_at)}
                    </span>
                  </div>

                  {c.reference && (
                    <p className="text-xs font-medium text-muted-foreground mt-1.5 truncate">
                      Ref: {c.reference}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AgentShell>
  );
}
