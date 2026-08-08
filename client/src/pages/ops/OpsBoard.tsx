import { Loader2, LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { OpsShell } from '@/components/ops/OpsShell';
import { OpsOrderCard } from '@/components/ops/OpsOrderCard';
import { BandHeader } from '@/components/agent/BandHeader';
import { Button } from '@/components/ui/button';
import { useOpsOrders } from '@/hooks/useOpsOrders';
import { OPS_PHASES, groupOrdersByPhase } from '@/lib/opsPhases';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * Read-only ops order board.
 * Desktop: phase columns. Mobile: vertical phase sections.
 * Cancelled collapsed by default.
 */
export default function OpsBoard() {
  const [, setLocation] = useLocation();
  const { logout } = useAppStore();
  const { data: orders, isLoading, error, isError } = useOpsOrders();

  const forbidden =
    isError &&
    error instanceof Error &&
    error.message.startsWith('403:');

  const handleLogout = async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    logout();
    setLocation('/login');
  };

  if (forbidden) {
    return (
      <OpsShell title="Operations" subtitle="Access required">
        <div
          className="rounded-2xl border border-border bg-white p-6 text-center"
          data-testid="ops-forbidden"
        >
          <p className="text-base font-semibold text-foreground">Ops access required</p>
          <p className="text-sm text-muted-foreground mt-2">
            This account does not have the admin role. Sign out and use an ops account.
          </p>
          <Button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-5 bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] font-semibold"
            data-testid="button-ops-forbidden-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </OpsShell>
    );
  }

  const grouped = groupOrdersByPhase(orders ?? []);
  const columnPhases = OPS_PHASES.filter((p) => p.showAsColumn);
  const cancelledPhase = OPS_PHASES.find((p) => p.id === 'cancelled');
  const cancelledOrders = grouped.cancelled;

  return (
    <OpsShell title="Order board" subtitle="Hub queue" wide>
      {isLoading && (
        <div className="flex justify-center py-16" data-testid="ops-board-loading">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && !forbidden && (
        <p className="text-sm text-red-600 py-8 text-center" data-testid="ops-board-error">
          Could not load orders. Try refreshing.
        </p>
      )}

      {!isLoading && !isError && (orders?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center" data-testid="ops-board-empty">
          No orders yet.
        </p>
      )}

      {!isLoading && !isError && (orders?.length ?? 0) > 0 && (
        <>
          <div
            className="hidden md:grid md:grid-cols-4 md:gap-4 md:items-start"
            data-testid="ops-board-columns"
          >
            {columnPhases.map((phase) => {
              const list = grouped[phase.id];
              return (
                <section
                  key={phase.id}
                  className="min-w-0 rounded-2xl border border-border bg-white overflow-hidden"
                  data-testid={`ops-phase-col-${phase.id}`}
                >
                  <div className="px-3 pt-3">
                    <BandHeader label={phase.label} count={list.length} />
                  </div>
                  <div className="px-3 pb-2 divide-y divide-border">
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center">None</p>
                    ) : (
                      list.map((order) => (
                        <OpsOrderCard key={order.id} order={order} />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="md:hidden space-y-6" data-testid="ops-board-mobile">
            {columnPhases.map((phase) => {
              const list = grouped[phase.id];
              return (
                <section key={phase.id} data-testid={`ops-phase-mobile-${phase.id}`}>
                  <BandHeader label={phase.label} count={list.length} />
                  <div className="rounded-2xl border border-border bg-white px-3 divide-y divide-border">
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center">None</p>
                    ) : (
                      list.map((order) => (
                        <OpsOrderCard key={order.id} order={order} />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {cancelledPhase && (
            <details
              className={cn('mt-6 rounded-2xl border border-border bg-white', 'group')}
              data-testid="ops-phase-cancelled"
            >
              <summary className="cursor-pointer list-none px-3 py-3 flex items-center justify-between gap-2">
                <BandHeader
                  label={cancelledPhase.label}
                  count={cancelledOrders.length}
                />
                <span className="text-xs font-semibold text-muted-foreground shrink-0 group-open:hidden">
                  Show
                </span>
                <span className="text-xs font-semibold text-muted-foreground shrink-0 hidden group-open:inline">
                  Hide
                </span>
              </summary>
              <div className="px-3 pb-2 border-t border-border divide-y divide-border">
                {cancelledOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">None</p>
                ) : (
                  cancelledOrders.map((order) => (
                    <OpsOrderCard key={order.id} order={order} />
                  ))
                )}
              </div>
            </details>
          )}
        </>
      )}
    </OpsShell>
  );
}
