/** Row shape from GET /api/shipments/history */
export interface ShipmentHistoryItem {
  awb_number: string;
  consignee_name: string | null;
  consignee_city: string | null;
  consignee_country: string | null;
  service_name: string | null;
  total_amount: string | number | null;
  currency: string | null;
  current_status: string | null;
  booking_date: string | null;
  created_at: string;
}
