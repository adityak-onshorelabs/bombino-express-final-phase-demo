import { useMemo } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { OpsShell } from '@/components/ops/OpsShell';
import { OpsOrderCard } from '@/components/ops/OpsOrderCard';
import { OpsBoardFilterBar } from '@/components/ops/OpsBoardFilterBar';
import { BandHeader } from '@/components/agent/BandHeader';
import { Button } from '@/components/ui/button';
import { useOpsOrders, type OpsBoardOrder } from '@/hooks/useOpsOrders';
import {
  useOpsBoardFilters,
  type OpsFilterConfig,
} from '@/hooks/useOpsBoardFilters';
import { OPS_PHASES, groupOrdersByPhase } from '@/lib/opsPhases';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const STAGE_PHASES = OPS_PHASES.filter(
  (p) => p.showAsColumn && p.id !== 'dispatched' && p.id !== 'cancelled'
);

const COL_CLASS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

function OrderList({ orders }: { orders: OpsBoardOrder[] }) {
  return (
    <>
      {orders.map((order) => (
        <OpsOrderCard key={order.id} order={order} />
      ))}
    </>
  );
}

/**
 * Pickups / Drop-offs / Dispatched — same GET /api/ops/orders list, filtered
 * in the client. Search and filters are local to the section.
 */
export function OpsSectionBoard({
  title,
  subtitle,
  filter,
  mode,
  filterConfig,
}: {
  title: string;
  subtitle: string;
  filter: (order: OpsBoardOrder) => boolean;
  mode: 'stages' | 'flat';
  filterConfig: OpsFilterConfig;
}) {
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

  const sectionOrders = useMemo(
    () => (orders ?? []).filter(filter),
    [orders, filter]
  );

  const {
    visible,
    filters,
    setFilters,
    sort,
    setSort,
    query,
    setQuery,
    activeCount,
    clear,
  } = useOpsBoardFilters(sectionOrders, filterConfig);

  const searching = query.trim().length > 0;

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

  const grouped = groupOrdersByPhase(visible);
  const filledPhases = STAGE_PHASES.filter((phase) => grouped[phase.id].length > 0);
  const colClass = COL_CLASS[filledPhases.length] ?? 'md:grid-cols-3';

  return (
    <OpsShell title={title} subtitle={subtitle} wide>
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

      {!isLoading && !isError && (
        <>
          <OpsBoardFilterBar
            config={filterConfig}
            filters={filters}
            setFilters={setFilters}
            sort={sort}
            setSort={setSort}
            query={query}
            setQuery={setQuery}
            activeCount={activeCount}
            onClear={clear}
          />

          {sectionOrders.length === 0 && (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="ops-board-empty">
              No orders in this section.
            </p>
          )}

          {sectionOrders.length > 0 && visible.length === 0 && (
            <div className="py-12 text-center" data-testid="ops-board-no-matches">
              <p className="text-sm text-muted-foreground">
                {searching && activeCount === 0
                  ? 'No matches'
                  : 'No orders match these filters. Among the latest 200 orders.'}
              </p>
              {activeCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  onClick={clear}
                  data-testid="ops-filters-clear-empty"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {visible.length > 0 && mode === 'flat' && (
            <div
              className="rounded-2xl border border-border bg-white px-3 divide-y divide-border"
              data-testid="ops-board-flat"
            >
              <OrderList orders={visible} />
            </div>
          )}

          {visible.length > 0 && mode === 'stages' && filledPhases.length > 0 && (
            <>
              <div
                className={cn('hidden md:grid md:gap-4 md:items-start', colClass)}
                data-testid="ops-board-columns"
              >
                {filledPhases.map((phase) => {
                  const list = grouped[phase.id];
                  return (
                    <section
                      key={phase.id}
                      className="min-w-0 rounded-2xl border border-border bg-white overflow-hidden"
                      data-testid={`ops-phase-col-${phase.id}`}
                    >
                      <div className="px-3 pt-3 flex items-start justify-between gap-2">
                        <BandHeader label={phase.label} />
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums shrink-0">
                          {list.length}
                        </span>
                      </div>
                      <div className="px-3 pb-2 divide-y divide-border">
                        <OrderList orders={list} />
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="md:hidden space-y-6" data-testid="ops-board-mobile">
                {filledPhases.map((phase) => {
                  const list = grouped[phase.id];
                  return (
                    <section key={phase.id} data-testid={`ops-phase-mobile-${phase.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <BandHeader label={phase.label} />
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums shrink-0">
                          {list.length}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-3 divide-y divide-border">
                        <OrderList orders={list} />
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </OpsShell>
  );
}
