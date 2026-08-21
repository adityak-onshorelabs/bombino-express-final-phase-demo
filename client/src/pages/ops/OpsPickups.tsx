import { OpsSectionBoard } from '@/components/ops/OpsSectionBoard';
import type { OpsBoardOrder } from '@/hooks/useOpsOrders';

function isActivePickup(order: OpsBoardOrder): boolean {
  return (
    order.pickup_request === 1 &&
    order.status !== 'dispatched' &&
    order.status !== 'cancelled'
  );
}

export default function OpsPickups() {
  return (
    <OpsSectionBoard
      title="Pickups"
      subtitle="Active pickup orders"
      filter={isActivePickup}
      mode="stages"
    />
  );
}
