import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvailableAction } from '@shared/orderContract';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';

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

export type OpsOrderDetailResponse = {
  order: OpsOrderDetail;
  events: OpsOrderEvent[];
  availableActions: AvailableAction[];
};

export type OpsActionResult = {
  order: OpsOrderDetail;
  availableActions: AvailableAction[];
  receipt?: { txnId: string | null; amount: number };
  warning?: string;
};

export type OpsActionError = Error & {
  status?: number;
  code?: string;
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
    refetchOnMount: 'always',
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
      return readJson<OpsOrderDetailResponse>(res);
    },
    retry: false,
  });
}

export function useOpsOrderAction(orderId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<
    OpsActionResult,
    OpsActionError,
    { action: string; payload?: Record<string, unknown> }
  >({
    mutationFn: async ({ action, payload }) => {
      if (!orderId) throw new Error('Missing order id') as OpsActionError;
      try {
        const res = await apiRequest('POST', `/api/orders/${orderId}/actions`, {
          action,
          ...(payload ? { payload } : {}),
        });
        return (await res.json()) as OpsActionResult;
      } catch (err) {
        const error = new Error(
          parseApiErrorMessage(err, 'Could not complete that action'),
        ) as OpsActionError;
        const raw = String((err as Error)?.message ?? '');
        const status = Number(raw.split(':')[0]);
        error.status = Number.isFinite(status) ? status : 0;
        try {
          const body = JSON.parse(raw.replace(/^\d+:\s*/, '')) as {
            code?: string;
            message?: string;
          };
          error.code = body.code;
          if (body.message) error.message = body.message;
        } catch {
          error.code = undefined;
        }
        throw error;
      }
    },
    onSettled: (_data, _err, _vars) => {
      if (!orderId) return;
      void queryClient.invalidateQueries({ queryKey: opsOrderDetailKey(orderId) });
      void queryClient.invalidateQueries({ queryKey: OPS_ORDERS_KEY });
    },
  });
}
