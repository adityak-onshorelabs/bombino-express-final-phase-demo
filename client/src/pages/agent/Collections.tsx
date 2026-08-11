import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import { BandHeader } from '@/components/agent/BandHeader';
import { money } from '@/components/agent/PickupCard';
import { useCollections } from '@/hooks/useAgentPickups';

/**
 * Every payment this agent has taken today, with its transaction id.
 *
 * Exists because a transaction id that only appears in a toast is useless
 * twenty minutes later. This is where an agent reconciles their pouch at the
 * end of a shift, and where they look when a customer rings the hub asking for
 * proof.
 *
 * The amber field at the top holds the one figure that is physically in the
 * agent's bag and has to be handed over. UPI sits under the rule inside it,
 * because it is the same day's money but not their problem.
 *
 * The ledger is rows in one panel, not a card each: this is a document being
 * reconciled line by line, and a stack of bordered cards makes four
 * transactions look like four decisions.
 */
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
}

export default function Collections() {
  const { data, isLoading, isError, refetch } = useCollections();

  return (
    <AgentShell title="Money today" subtitle="Reconcile before you hand over">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-[#64748B]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="bg-white border border-[#E2E8F0]! rounded-[4px] px-4 py-5">
          <p className="text-sm font-medium text-[#334155]">
            Could not load today's collections. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-11 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41]"
            data-testid="button-retry-collections"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          <div className="bg-[#F2A123] p-4" data-testid="field-cash-on-hand">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#1B2A41]">
              Cash in your bag
            </p>
            <p className="font-mono text-[44px] font-bold leading-none tracking-[-0.02em] text-[#1B2A41] tabular-nums mt-2">
              ₹{money(data.totals.cash)}
            </p>
            <div className="flex gap-5 mt-3.5 pt-3 border-t border-[#1B2A41]/[0.28]!">
              <span className="font-mono text-[11px] font-semibold text-[#1B2A41] tabular-nums">
                ₹{money(data.totals.upi)} BY UPI
              </span>
              <span className="font-mono text-[11px] font-semibold text-[#1B2A41] tabular-nums">
                {data.totals.count} COLLECTION{data.totals.count === 1 ? '' : 'S'}
              </span>
            </div>
          </div>

          <section>
            <BandHeader label="Ledger" testId="band-ledger" />
            <div className="bg-white border border-[#E2E8F0]! rounded-[4px] overflow-hidden">
              {data.collections.length === 0 ? (
                <p className="px-4 py-5 text-sm font-medium text-[#334155]">
                  Payments you take at the door appear here.
                </p>
              ) : (
                data.collections.map((c, i) => (
                  <div
                    key={c.id}
                    className={cn(
                      'flex items-baseline gap-3 px-4 py-3',
                      i < data.collections.length - 1 && 'border-b border-[#E2E8F0]!',
                    )}
                    data-testid={`collection-${c.txn_id ?? c.id}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-mono text-[13px] font-semibold text-[#1B2A41] truncate">
                        {c.txn_id ?? 'NO TXN ID'}
                      </span>
                      <span className="block font-mono text-[10.5px] font-medium tracking-[0.06em] text-[#64748B] mt-[3px]">
                        {[
                          c.order_no ?? '—',
                          formatTime(c.collected_at),
                          c.collection_mode === 'cash' ? 'CASH' : 'UPI',
                        ].join(' · ')}
                      </span>
                      {c.reference && (
                        <span className="block font-mono text-[10.5px] font-medium text-[#94A3B8] mt-[3px] truncate">
                          REF {c.reference}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[17px] font-bold text-[#1B2A41] tabular-nums shrink-0">
                      ₹{money(c.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <p className="border-t border-[#E2E8F0]! pt-3.5 text-sm font-medium leading-[1.5] text-[#334155]">
            Hand the cash to the hub at the end of your shift. UPI is already settled.
          </p>
        </div>
      )}
    </AgentShell>
  );
}
