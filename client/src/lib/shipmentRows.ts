import type { ShipmentHistoryItem } from '@/lib/shipmentApiTypes';
import { getStatusLabel, getStatusColor, type AwbStatusTone } from '@/lib/awbStatus';
import { getOrderStatusLabel, getOrderStatusTone } from '@/lib/orderStatus';

/** Row shape from GET /api/orders (server/ordersDb.ts OrderRow) */
export interface OrderApiRow {
  id: string;
  order_no: string;
  status: string;
  consignee: { name?: string; city?: string; country_name?: string } | null;
  items: { api_service_code?: string; free_form_currency?: string } | null;
  quoted_amount: number | null;
  final_amount: number | null;
  awb_no: string | null;
  created_at: string;
}

/** Unified display row — either a real ITD shipment or a pre-docket Bombino order. */
export interface DisplayRow {
  key: string;
  displayId: string; // awb_number or order_no
  isOrder: boolean;
  recipient: string;
  city: string;
  country: string;
  service: string;
  bookingDate: string | null;
  amountStr: string | null;
  statusLabel: string;
  statusTone: AwbStatusTone;
  createdAt: string;
}

export function formatShipmentAmount(amount: string | number | null, currency: string | null): string | null {
  if (amount === null || amount === undefined) return null;
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return null;
  const cur = (currency ?? 'INR').toUpperCase();
  if (cur === 'INR' || cur === '₹') {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return `${cur} ${n.toLocaleString()}`;
}

export function shipmentToRow(item: ShipmentHistoryItem): DisplayRow {
  const hasStatus = !!item.current_status?.trim();
  return {
    key: `shipment-${item.awb_number}`,
    displayId: item.awb_number,
    isOrder: false,
    recipient: item.consignee_name?.trim() || 'Unnamed recipient',
    city: item.consignee_city?.trim() || '',
    country: item.consignee_country?.trim() || '',
    service: item.service_name?.trim() || '',
    bookingDate: item.booking_date,
    amountStr: formatShipmentAmount(item.total_amount, item.currency),
    statusLabel: hasStatus ? getStatusLabel(item.current_status as string) : 'Unknown',
    statusTone: hasStatus ? getStatusColor(item.current_status as string) : 'gray',
    createdAt: item.created_at,
  };
}

export function orderToRow(order: OrderApiRow): DisplayRow {
  return {
    key: `order-${order.id}`,
    displayId: order.order_no,
    isOrder: true,
    recipient: order.consignee?.name?.trim() || 'Unnamed recipient',
    city: order.consignee?.city?.trim() || '',
    country: order.consignee?.country_name?.trim() || '',
    service: order.items?.api_service_code?.trim() || '',
    bookingDate: order.created_at,
    amountStr: formatShipmentAmount(order.final_amount ?? order.quoted_amount, order.items?.free_form_currency ?? null),
    statusLabel: getOrderStatusLabel(order.status),
    statusTone: getOrderStatusTone(order.status),
    createdAt: order.created_at,
  };
}

/** Fetches /api/shipments/history + /api/orders in parallel and merges into one
 *  newest-first list. Used by Home (mobile + desktop) and Orders so a booking
 *  shows up everywhere, not just in one place. */
export async function fetchMergedShipmentRows(): Promise<DisplayRow[]> {
  const [shipmentsRes, ordersRes] = await Promise.all([
    fetch('/api/shipments/history', { credentials: 'include' }).catch(() => null),
    fetch('/api/orders', { credentials: 'include' }).catch(() => null),
  ]);

  const shipmentRows: DisplayRow[] =
    shipmentsRes && shipmentsRes.ok
      ? ((await shipmentsRes.json().catch(() => [])) as ShipmentHistoryItem[]).map(shipmentToRow)
      : [];
  const orderRows: DisplayRow[] =
    ordersRes && ordersRes.ok
      ? (((await ordersRes.json().catch(() => ({ orders: [] }))) as { orders: OrderApiRow[] }).orders ?? []).map(
          orderToRow
        )
      : [];

  return [...shipmentRows, ...orderRows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
