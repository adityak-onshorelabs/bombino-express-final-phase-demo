import { useMemo, useState } from 'react';
import { Loader2, LogOut, Search } from 'lucide-react';
import { useLocation } from 'wouter';
import { OpsShell } from '@/components/ops/OpsShell';
import { OpsOrderCard } from '@/components/ops/OpsOrderCard';
import { BandHeader } from '@/components/agent/BandHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOpsOrders, type OpsBoardOrder } from '@/hooks/useOpsOrders';
import { OPS_PHASES, groupOrdersByPhase } from '@/lib/opsPhases';
import { useAppStore } from '@/lib/store';

const STAGE_PHASES = OPS_PHASES.filter(
  (p) => p.showAsColumn && p.id !== 'dispatched' && p.id !== 'cancelled'
);

function matchesSearch(order: OpsBoardOrder, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = [order.order_no, order.consignee_name, order.consignee_city]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

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
 * in the client. Search is local to the section.
 */
export function OpsSectionBoard({
  title,
  subtitle,
  filter,
  mode,
}: {
  title: string;
  subtitle: string;
  filter: (order: OpsBoardOrder) => boolean;
  mode: 'stages' | 'flat';
}) {
  const [, setLocation] = useLocation();
  const { logout } = useAppStore();
  const { data: orders, isLoading, error, isError } = useOpsOrders();
  const [query, setQuery] = useState('');

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

  const visible = useMemo(
    () => sectionOrders.filter((order) => matchesSearch(order, query)),
    [sectionOrders, query]
  );

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
          <div className="relative mb-4">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order no or consignee"
              className="h-11 pl-9 rounded-xl bg-white"
              data-testid="ops-section-search"
              aria-label="Search order no or consignee"
            />
          </div>

          {sectionOrders.length === 0 && (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="ops-board-empty">
              No orders in this section.
            </p>
          )}

          {sectionOrders.length > 0 && visible.length === 0 && searching && (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="ops-board-no-matches">
              No matches
            </p>
          )}

          {visible.length > 0 && mode === 'flat' && (
            <div
              className="rounded-2xl border border-border bg-white px-3 divide-y divide-border"
              data-testid="ops-board-flat"
            >
              <OrderList orders={visible} />
            </div>
          )}

          {visible.length > 0 && mode === 'stages' && (
            <>
              <div
                className="hidden md:grid md:grid-cols-3 md:gap-4 md:items-start"
                data-testid="ops-board-columns"
              >
                {STAGE_PHASES.map((phase) => {
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
                        {list.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-6 text-center">None</p>
                        ) : (
                          <OrderList orders={list} />
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="md:hidden space-y-6" data-testid="ops-board-mobile">
                {STAGE_PHASES.map((phase) => {
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
                        {list.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-6 text-center">None</p>
                        ) : (
                          <OrderList orders={list} />
                        )}
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
