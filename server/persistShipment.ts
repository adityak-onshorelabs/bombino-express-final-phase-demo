import { safeQuery, safeQueryOne } from "./appDb.js";
import type { CreateShipmentPayload, CreateShipmentResponse } from "./itd.js";

function countryCodeFromLabel(country: string | undefined): string {
  const c = (country ?? "").trim();
  if (c.length === 2) return c.toUpperCase();
  if (/^india/i.test(c)) return "IN";
  if (/^united states|^usa|^u\.s\.?a?/i.test(c)) return "US";
  return c.length >= 2 ? c.slice(0, 2).toUpperCase() : "IN";
}

function parseOptionalAmount(value: string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseWeightKg(payload: CreateShipmentPayload): number | null {
  const n = parseFloat(payload.actual_weight);
  return Number.isFinite(n) ? n : null;
}

function parsePieces(payload: CreateShipmentPayload): number | null {
  const n = parseInt(payload.pcs, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDeclaredValue(payload: CreateShipmentPayload): number | null {
  const n = parseFloat(payload.shipment_value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fire-and-forget DB persistence after successful ITD create_docket.
 * Uses only safeQuery/safeQueryOne; logs and returns on any failure.
 */
export async function persistShipmentAfterCreate(
  dbUserId: string,
  payload: CreateShipmentPayload,
  itdResponse: CreateShipmentResponse,
  ipAddress: string | undefined
): Promise<void> {
  if (!itdResponse.success || !itdResponse.data?.awb_no) {
    return;
  }

  const awb = itdResponse.data.awb_no;
  const bookingDate = new Date().toISOString().split("T")[0];

  const senderCountryCode = countryCodeFromLabel(payload.shipper_country);
  const recipientCountryCode = countryCodeFromLabel(payload.consignee_country);

  const senderRow = (await safeQueryOne(
    `INSERT INTO addresses (
      user_id, type, full_name, company, email, phone,
      address_line_1, city, state, pincode, country_code, country_name
    ) VALUES ($1, 'sender', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [
      dbUserId,
      payload.shipper_name,
      payload.shipper_company_name || null,
      payload.shipper_email || null,
      payload.shipper_contact_no,
      payload.shipper_address_line_1,
      payload.shipper_city,
      payload.shipper_state || null,
      payload.shipper_zip_code || null,
      senderCountryCode,
      payload.shipper_country || null,
    ]
  )) as { id: string } | null;

  if (!senderRow?.id) {
    console.error("[persistShipment] sender address insert failed");
    return;
  }

  const recipientRow = (await safeQueryOne(
    `INSERT INTO addresses (
      user_id, type, full_name, company, email, phone,
      address_line_1, city, state, pincode, country_code, country_name
    ) VALUES ($1, 'recipient', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [
      dbUserId,
      payload.consignee_name,
      payload.consignee_company_name || null,
      payload.consignee_email || null,
      payload.consignee_contact_no,
      payload.consignee_address_line_1,
      payload.consignee_city,
      payload.consignee_state || null,
      payload.consignee_zip_code || null,
      recipientCountryCode,
      payload.consignee_country || null,
    ]
  )) as { id: string } | null;

  if (!recipientRow?.id) {
    console.error("[persistShipment] recipient address insert failed");
    return;
  }

  const remoteCharges = parseOptionalAmount(itdResponse.data.remote_area_charges);
  const totalAmount = remoteCharges;

  const shipmentRow = (await safeQueryOne(
    `INSERT INTO shipments (
      user_id, awb_number, sender_address_id, recipient_address_id,
      sender_name, sender_company, sender_phone, sender_city, sender_state, sender_country,
      consignee_name, consignee_company, consignee_phone, consignee_city, consignee_state, consignee_country,
      service_name, service_code, product_code,
      origin_country, destination_country,
      weight_kg, pieces, declared_value, currency,
      invoice_number, contents_description,
      total_amount, other_charges,
      current_status, booking_date, itd_response
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16,
      $17, $18, $19,
      $20, $21,
      $22, $23, $24, $25,
      $26, $27,
      $28, $29,
      $30, $31, $32::jsonb
    )
    RETURNING id`,
    [
      dbUserId,
      awb,
      senderRow.id,
      recipientRow.id,
      payload.shipper_name,
      payload.shipper_company_name || null,
      payload.shipper_contact_no,
      payload.shipper_city,
      payload.shipper_state || null,
      payload.shipper_country || null,
      payload.consignee_name,
      payload.consignee_company_name || null,
      payload.consignee_contact_no,
      payload.consignee_city,
      payload.consignee_state || null,
      payload.consignee_country || null,
      payload.api_service_code || null,
      payload.product_code || null,
      payload.product_code || null,
      senderCountryCode,
      recipientCountryCode,
      parseWeightKg(payload),
      parsePieces(payload),
      parseDeclaredValue(payload),
      payload.shipment_value_currency || "INR",
      payload.shipment_invoice_no || null,
      payload.shipment_content || null,
      totalAmount,
      remoteCharges,
      "ENTRY",
      bookingDate,
      JSON.stringify(itdResponse),
    ]
  )) as { id: string } | null;

  if (!shipmentRow?.id) {
    console.error("[persistShipment] shipment insert failed");
    return;
  }

  const notifBody = `Your shipment has been booked. AWB: ${awb}`;

  await safeQuery(
    `INSERT INTO notifications (user_id, type, title, body, data, shipment_id)
     VALUES ($1, 'shipment_created', $2, $3, $4::jsonb, $5)`,
    [
      dbUserId,
      "Shipment Booked",
      notifBody,
      JSON.stringify({ awb }),
      shipmentRow.id,
    ]
  );

  await safeQuery(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, metadata, ip_address)
     VALUES ($1, 'shipment_created', 'shipment', $2, $3::jsonb, $4)`,
    [
      dbUserId,
      awb,
      JSON.stringify({
        awb_number: awb,
        docket_id: itdResponse.data.docket_id,
        shipment_id: shipmentRow.id,
      }),
      ipAddress ?? null,
    ]
  );
}
