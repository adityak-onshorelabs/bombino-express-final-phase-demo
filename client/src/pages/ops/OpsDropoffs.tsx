import { OpsSectionBoard } from '@/components/ops/OpsSectionBoard';
import type { OpsBoardOrder } from '@/hooks/useOpsOrders';

function isActiveDropoff(order: OpsBoardOrder): boolean {
  return (
    order.pickup_request === 2 &&
    order.status !== 'dispatched' &&
    order.status !== 'cancelled'
  );
}

export default function OpsDropoffs() {
  return (
    <OpsSectionBoard
      title="Drop-offs"
      subtitle="Active drop-off orders"
      filter={isActiveDropoff}
      mode="stages"
    />
  );
}
