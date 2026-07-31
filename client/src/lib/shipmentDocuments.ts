// ITD's create_docket response returns every printable in `labels`:
//   [0] vendor_shipper_copy.pdf              (AWB label — always)
//   [1] vendor_box_label.pdf                 (box label — always)
//   [2] freeform_invoice.pdf                 (invoice — only when one was raised)
//   [3] <ts>_<seq>_<tracking>_label[_n].pdf  (carrier / postal service label — postal
//                                             service shipments only)
// The count varies per shipment, so match on filename and fall back to
// position only when the entries carry no filename.
export type ShipmentDocumentKind = 'label' | 'boxLabel' | 'postalLabel' | 'invoice';

export interface ItdLabelEntry {
  label?: string;
  filename?: string;
  file_type?: string;
}

const MATCHERS: Record<ShipmentDocumentKind, { pattern: RegExp; fallbackIndex: number }> = {
  label: { pattern: /shipper_copy/i, fallbackIndex: 0 },
  boxLabel: { pattern: /box_label/i, fallbackIndex: 1 },
  // Carrier label: label-ish, but neither a vendor_* printable nor the invoice.
  postalLabel: { pattern: /^(?!vendor_)(?!.*invoice).*label/i, fallbackIndex: 3 },
  invoice: { pattern: /invoice/i, fallbackIndex: 2 },
};

export const SHIPMENT_DOCUMENT_META: Record<
  ShipmentDocumentKind,
  { path: string; responseKey: string; fileName: string; title: string }
> = {
  label: {
    path: 'label',
    responseKey: 'label',
    fileName: 'shipment-label.pdf',
    title: 'AWB Label',
  },
  boxLabel: {
    path: 'box-label',
    responseKey: 'boxLabel',
    fileName: 'box-label.pdf',
    title: 'Box Label',
  },
  postalLabel: {
    path: 'postal-label',
    responseKey: 'postalLabel',
    fileName: 'postal-label.pdf',
    title: 'Postal Label',
  },
  invoice: {
    path: 'invoice',
    responseKey: 'invoice',
    fileName: 'shipment-invoice.pdf',
    title: 'Shipment Invoice',
  },
};

// Display order for the action row.
export const SHIPMENT_DOCUMENT_ORDER: ShipmentDocumentKind[] = [
  'label',
  'boxLabel',
  'postalLabel',
  'invoice',
];

export function pickShipmentDocument(
  labels: ItdLabelEntry[] | undefined,
  kind: ShipmentDocumentKind
): string | null {
  if (!Array.isArray(labels)) return null;

  const { pattern, fallbackIndex } = MATCHERS[kind];
  const named = labels.filter((e) => typeof e?.filename === 'string' && e.filename);
  const entry =
    named.length > 0
      ? named.find((e) => pattern.test(e.filename as string))
      : labels[fallbackIndex];

  const doc = entry?.label;
  return typeof doc === 'string' && doc ? doc : null;
}
