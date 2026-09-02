import { OpsSectionBoard } from '@/components/ops/OpsSectionBoard';
import { DISPATCHED_FILTER_CONFIG } from '@/hooks/useOpsBoardFilters';
import type { OpsBoardOrder } from '@/hooks/useOpsOrders';

function isDispatched(order: OpsBoardOrder): boolean {
  return order.status === 'dispatched';
}

export default function OpsDispatched() {
  return (
    <OpsSectionBoard
      title="Dispatched"
      subtitle="AWB generated"
      filter={isDispatched}
      mode="flat"
      filterConfig={DISPATCHED_FILTER_CONFIG}
    />
  );
}
