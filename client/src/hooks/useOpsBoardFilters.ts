import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { PaymentMethod } from '@shared/orderContract';
import { nowInIst, startOfIstDayIso } from '@shared/pickupSlots';
import { phaseIdForStatus } from '@/lib/opsPhases';
import type { OpsBoardOrder } from '@/hooks/useOpsOrders';

export type OpsFilterConfig = {
  assignment?: boolean;
  stage?: boolean;
  dateRange?: boolean;
  pickupDate?: boolean;
  paymentMethod?: boolean;
  cod?: boolean;
  sort?: boolean;
};

export const PICKUPS_FILTER_CONFIG: OpsFilterConfig = {
  assignment: true,
  stage: true,
  dateRange: true,
  pickupDate: true,
  paymentMethod: true,
  cod: true,
  sort: true,
};

export const DROPOFFS_FILTER_CONFIG: OpsFilterConfig = {
  assignment: false,
  stage: true,
  dateRange: true,
  pickupDate: false,
  paymentMethod: true,
  cod: true,
  sort: true,
};

export const DISPATCHED_FILTER_CONFIG: OpsFilterConfig = {
  assignment: false,
  stage: false,
  dateRange: true,
  pickupDate: true,
  paymentMethod: true,
  cod: true,
  sort: true,
};

export type OpsAssignmentFilter = 'all' | 'assigned' | 'unassigned';
export type OpsStageFilter = 'all' | 'inbound' | 'hub' | 'settled';
export type OpsDateField = 'booking' | 'pickup';
export type OpsDateRange = 'all' | 'today' | '7d' | '30d' | 'tomorrow' | 'week';
export type OpsPaymentMethodFilter = 'all' | PaymentMethod;
export type OpsCodFilter = 'all' | 'cod';
export type OpsBoardSort = 'newest' | 'oldest';

export type OpsBoardFilters = {
  assignment: OpsAssignmentFilter;
  stage: OpsStageFilter;
  dateField: OpsDateField;
  dateRange: OpsDateRange;
  paymentMethod: OpsPaymentMethodFilter;
  cod: OpsCodFilter;
};

export const DEFAULT_OPS_BOARD_FILTERS: OpsBoardFilters = {
  assignment: 'all',
  stage: 'all',
  dateField: 'booking',
  dateRange: 'all',
  paymentMethod: 'all',
  cod: 'all',
};

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'pay_now',
  'pay_at_pickup',
  'pay_at_dropoff',
  'cod',
];

export { PAYMENT_METHODS };

export type OpsDateRangeOption = { value: OpsDateRange; label: string };

const BOOKING_DATE_RANGES: readonly OpsDateRangeOption[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const PICKUP_DATE_RANGES: readonly OpsDateRangeOption[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Next 7 days' },
];

export function dateRangesForField(field: OpsDateField): readonly OpsDateRangeOption[] {
  return field === 'pickup' ? PICKUP_DATE_RANGES : BOOKING_DATE_RANGES;
}

export function coerceDateRange(field: OpsDateField, range: OpsDateRange): OpsDateRange {
  return dateRangesForField(field).some((option) => option.value === range) ? range : 'all';
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function bookingCutoffYmd(range: OpsDateRange): string | null {
  if (range === 'all' || range === 'tomorrow' || range === 'week') return null;
  const today = nowInIst().date;
  if (range === 'today') return today;
  if (range === '7d') return addCalendarDays(today, -6);
  return addCalendarDays(today, -29);
}

function matchesSearch(order: OpsBoardOrder, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = [order.order_no, order.consignee_name, order.consignee_city]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase();
  return hay.includes(needle);
}

function isCodOrder(order: OpsBoardOrder): boolean {
  return order.is_cod || order.payment_method === 'cod';
}

function matchesDate(
  order: OpsBoardOrder,
  filters: OpsBoardFilters,
  config: OpsFilterConfig,
): boolean {
  if (filters.dateRange === 'all') return true;

  const field = config.pickupDate === false ? 'booking' : filters.dateField;
  const range = coerceDateRange(field, filters.dateRange);
  if (range === 'all') return true;

  if (field === 'pickup') {
    if (!order.pickup_date) return false;
    const today = nowInIst().date;
    if (range === 'today') return order.pickup_date === today;
    if (range === 'tomorrow') return order.pickup_date === addCalendarDays(today, 1);
    if (range === 'week') {
      const end = addCalendarDays(today, 6);
      return order.pickup_date >= today && order.pickup_date <= end;
    }
    return true;
  }

  const cutoff = bookingCutoffYmd(range);
  if (!cutoff) return true;
  const created = Date.parse(order.created_at);
  const start = Date.parse(startOfIstDayIso(cutoff));
  if (!Number.isFinite(created) || !Number.isFinite(start)) return false;
  return created >= start;
}

function matchesFilters(
  order: OpsBoardOrder,
  filters: OpsBoardFilters,
  config: OpsFilterConfig,
): boolean {
  if (config.assignment && filters.assignment !== 'all') {
    const assigned = Boolean(order.agent_id);
    if (filters.assignment === 'assigned' && !assigned) return false;
    if (filters.assignment === 'unassigned' && assigned) return false;
  }

  if (config.stage && filters.stage !== 'all') {
    if (phaseIdForStatus(order.status) !== filters.stage) return false;
  }

  if (config.dateRange && !matchesDate(order, filters, config)) return false;

  if (config.paymentMethod && filters.paymentMethod !== 'all') {
    if (order.payment_method !== filters.paymentMethod) return false;
  }

  if (config.cod && filters.cod === 'cod' && !isCodOrder(order)) return false;

  return true;
}

function countActiveFilters(filters: OpsBoardFilters, config: OpsFilterConfig): number {
  let n = 0;
  if (config.assignment && filters.assignment !== 'all') n += 1;
  if (config.stage && filters.stage !== 'all') n += 1;
  if (config.dateRange && filters.dateRange !== 'all') n += 1;
  if (config.paymentMethod && filters.paymentMethod !== 'all') n += 1;
  if (config.cod && filters.cod !== 'all') n += 1;
  return n;
}

export type OpsBoardFilterState = {
  visible: OpsBoardOrder[];
  filters: OpsBoardFilters;
  setFilters: Dispatch<SetStateAction<OpsBoardFilters>>;
  sort: OpsBoardSort;
  setSort: Dispatch<SetStateAction<OpsBoardSort>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  activeCount: number;
  clear: () => void;
};

export function useOpsBoardFilters(
  orders: OpsBoardOrder[],
  config: OpsFilterConfig,
): OpsBoardFilterState {
  const [filters, setFilters] = useState<OpsBoardFilters>(DEFAULT_OPS_BOARD_FILTERS);
  const [sort, setSort] = useState<OpsBoardSort>('newest');
  const [query, setQuery] = useState('');

  const activeCount = useMemo(
    () => countActiveFilters(filters, config),
    [filters, config],
  );

  const visible = useMemo(() => {
    const filtered = orders.filter(
      (order) => matchesSearch(order, query) && matchesFilters(order, filters, config),
    );
    return [...filtered].sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      const aTime = Number.isFinite(da) ? da : 0;
      const bTime = Number.isFinite(db) ? db : 0;
      return sort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [orders, query, filters, config, sort]);

  const clear = useCallback(() => {
    setFilters(DEFAULT_OPS_BOARD_FILTERS);
  }, []);

  return {
    visible,
    filters,
    setFilters,
    sort,
    setSort,
    query,
    setQuery,
    activeCount,
    clear,
  };
}
