import { useQuery } from '@tanstack/react-query';

export type OpsBoardOrder = {
  id: string;
  order_no: string;
  status: string;
  created_at: string;
  pickup_request: number;
  pickup_date: string | null;
  pickup_slot: string | null;
  payment_method: string;
  payment_status: string;
  is_cod: boolean;
  quoted_amount: number | null;
  final_amount: number | null;
  consignee_name: string | null;
  consignee_city: string | null;
  agent_id: string | null;
  awb_no: string | null;
};

export type OpsOrderEvent = {
  id: string;
  status: string;
  note: string | null;
  actor_user_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type OpsOrderDetail = OpsBoardOrder & {
  user_id: string;
  origin_address_id: string | null;
  consignee: unknown;
  items: unknown;
  booked_weight: number | null;
  actual_weight: number | null;
  itd_docket_response: unknown;
  metadata: unknown;
  updated_at: string;
};

export const OPS_ORDERS_KEY = ['/api/ops/orders'] as const;

export function opsOrderDetailKey(id: string) {
  return ['/api/ops/orders', id] as const;
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function useOpsOrders() {
  return useQuery({
    queryKey: OPS_ORDERS_KEY,
    queryFn: async () => {
      const res = await fetch('/api/ops/orders', { credentials: 'include' });
      const data = await readJson<{ orders: OpsBoardOrder[] }>(res);
      return data.orders;
    },
    retry: false,
  });
}

export function useOpsOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: opsOrderDetailKey(orderId ?? ''),
    enabled: !!orderId,
    queryFn: async () => {
      const res = await fetch(`/api/ops/orders/${encodeURIComponent(orderId!)}`, {
        credentials: 'include',
      });
      return readJson<{ order: OpsOrderDetail; events: OpsOrderEvent[] }>(res);
    },
    retry: false,
  });
}
