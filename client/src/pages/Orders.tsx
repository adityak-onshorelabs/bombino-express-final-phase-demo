import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Package, Copy, Send, Search, ArrowRight, Download } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/lib/store';
import type { ShipmentHistoryItem } from '@/lib/shipmentApiTypes';
import { getStatusLabel, getStatusColor } from '@/lib/awbStatus';
import { useToast } from '@/hooks/use-toast';

/** RFC 4180-style CSV parse (quoted fields, escaped "", newlines inside quotes). */
function parseCsvRecords(csvText: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        fields.push(field);
        field = '';
      } else if (ch === '\r') {
        // skip
      } else if (ch === '\n') {
        fields.push(field);
        field = '';
        records.push(fields);
        fields = [];
      } else field += ch;
    }
  }
  if (field.length > 0 || fields.length > 0) {
    fields.push(field);
    records.push(fields);
  }
  return records;
}

function formatBookingDate(value: string | null): string {
  if (!value) return '—';
  const d = parseISO(value.length <= 10 ? `${value}T12:00:00Z` : value);
  if (!isValid(d)) return '—';
  return format(d, 'dd MMM yyyy');
}

function formatInr(amount: string | number | null, currency: string | null): string | null {
  if (amount === null || amount === undefined) return null;
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return null;
  const cur = (currency ?? 'INR').toUpperCase();
  if (cur === 'INR' || cur === '₹') {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return `${cur} ${n.toLocaleString()}`;
}

// ─── Compact track bar (mobile + desktop) ───────────────────────────────────
function TrackBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-xl bg-white border border-border shadow-[0_1px_2px_lab(34.0831_-9.57756_-27.7093_/_0.04),0_2px_12px_lab(34.0831_-9.57756_-27.7093_/_0.05)] p-1.5 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder="Track AWB number — e.g. BMB123456789"
          className="w-full h-11 pl-10 pr-3 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/70 font-medium tabular-nums tracking-tight"
          data-testid="input-tracking-orders"
        />
      </div>
      <button
        type="button"
        onClick={onSubmit}
        className="h-11 px-5 inline-flex items-center gap-2 text-sm font-semibold rounded-lg bg-[lab(34.0831_-9.57756_-27.7093)] text-white hover:bg-[#2F4468] transition-colors"
        data-testid="button-track-orders"
      >
        Track
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Row (responsive) ───────────────────────────────────────────────────────
function ShipmentRow({
  item,
  onOpen,
  onCopy,
}: {
  item: ShipmentHistoryItem;
  onOpen: (awb: string) => void;
  onCopy: (e: React.MouseEvent, awb: string) => void;
}) {
  const awb = item.awb_number;
  const amountStr = formatInr(item.total_amount, item.currency);
  const status = item.current_status?.trim() ? getStatusLabel(item.current_status) : 'Unknown';
  const tone = item.current_status?.trim() ? getStatusColor(item.current_status) : 'gray';
  const recipient = item.consignee_name?.trim() || '—';
  const city = item.consignee_city?.trim() || '';
  const recipientLine = city ? `${recipient} · ${city}` : recipient;

  return (
    <button
      type="button"
      onClick={() => onOpen(awb)}
      className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-3 md:px-4 py-3.5 md:py-3 hover:bg-muted/40 transition-colors md:grid-cols-[1.6fr_1.7fr_1.2fr_0.9fr_0.7fr_auto] md:gap-x-6 md:items-center"
      data-testid={`order-row-${awb}`}
    >
      {/* AWB + copy */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold tabular-nums text-sm text-foreground truncate">{awb}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => onCopy(e, awb)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onCopy(e as unknown as React.MouseEvent, awb);
          }}
          className="p-1 rounded hover:bg-muted shrink-0 cursor-pointer"
          aria-label={`Copy AWB ${awb}`}
        >
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        </span>
      </div>

      {/* Status badge (mobile: right-aligned on row 1) */}
      <div className="md:hidden justify-self-end">
        <StatusBadge status={status} tone={tone} />
      </div>

      {/* Recipient line (mobile: full row 2; desktop: column 2) */}
      <p className="col-span-2 md:col-span-1 text-[13px] md:text-sm text-muted-foreground truncate md:text-foreground/80">
        {recipientLine}
      </p>

      {/* Mobile-only secondary row: service · date · amount */}
      <p className="md:hidden col-span-2 text-[11px] text-muted-foreground/90 truncate -mt-0.5">
        {item.service_name ?? '—'} · {formatBookingDate(item.booking_date)}
        {amountStr ? <> · <span className="tabular-nums text-foreground/70">{amountStr}</span></> : null}
      </p>

      {/* Desktop columns 3-5 */}
      <span className="hidden md:block text-sm text-muted-foreground truncate">{item.service_name ?? '—'}</span>
      <span className="hidden md:block text-sm text-muted-foreground tabular-nums">{formatBookingDate(item.booking_date)}</span>
      <span className="hidden md:block text-sm tabular-nums text-right text-foreground/80">{amountStr ?? '—'}</span>

      {/* Desktop status */}
      <div className="hidden md:flex md:justify-end md:shrink-0">
        <StatusBadge status={status} tone={tone} />
      </div>
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function Orders() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { isLoggedIn } = useAppStore();
  const { toast } = useToast();

  const [trackingInput, setTrackingInput] = useState('');
  const [items, setItems] = useState<ShipmentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvOverlayData, setCsvOverlayData] = useState<string | null>(null);
  const [csvOverlayBlob, setCsvOverlayBlob] = useState<Blob | null>(null);

  const loadHistory = useCallback(async () => {
    if (!isLoggedIn) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/shipments/history', { credentials: 'include' });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as ShipmentHistoryItem[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const copyAwb = (e: React.MouseEvent, awb: string) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard.writeText(awb);
    toast({ title: 'Copied', description: awb });
  };

  const submitTrack = () => {
    const t = trackingInput.trim();
    if (t) setLocation(`/shipment/${encodeURIComponent(t)}`);
  };

  const openShipment = (awb: string) => {
    setLocation(`/shipment/${encodeURIComponent(awb)}`);
  };

  const handleDownloadCSV = async () => {
    try {
      const res = await fetch('/api/shipments/download-csv', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const text = await blob.text();
      if (!text.trim()) {
        toast({ title: 'No export data', description: 'No shipments found to export.' });
        return;
      }
      setCsvOverlayBlob(blob);
      setCsvOverlayData(text);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast({
        title: 'Export failed',
        description: 'Could not generate the export. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleShareCSV = async () => {
    if (!csvOverlayBlob || !csvOverlayData) return;
    const filename = 'bombino-shipments-' + new Date().toISOString().split('T')[0] + '.csv';
    const file = new File([csvOverlayBlob], filename, { type: 'text/csv' });
    try {
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: 'Bombino Shipments' });
      } else {
        await navigator.clipboard.writeText(csvOverlayData);
        toast({
          title: 'Copied to clipboard',
          description: 'CSV data copied. Paste into any spreadsheet app.',
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast({
        title: 'Share failed',
        description: 'Could not share the export.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-nav" data-testid="screen-orders">
      <Header onMenuClick={() => setMenuOpen(true)} />
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="max-w-5xl mx-auto px-4 md:px-0 py-5 md:py-6 space-y-6">

        {/* Compact track bar */}
        <TrackBar
          value={trackingInput}
          onChange={setTrackingInput}
          onSubmit={submitTrack}
        />

        {/* Header row */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-[22px] font-bold tracking-tight text-foreground">
              My shipments
              {isLoggedIn && !loading && items.length > 0 && (
                <span className="ml-2 text-sm font-medium text-muted-foreground tabular-nums">
                  · {items.length}
                </span>
              )}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Track your outgoing and incoming shipments.
            </p>
          </div>
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              data-testid="button-export-csv"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>

        {/* Body */}
        {!isLoggedIn ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-4">Sign in to view your shipments.</p>
            <Button className="bg-[lab(34.0831_-9.57756_-27.7093)] hover:bg-[#2F4468] rounded-lg" onClick={() => setLocation('/login')}>
              Login
            </Button>
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`px-4 py-3.5 ${i > 1 ? 'border-t border-border' : ''} space-y-2 animate-pulse`}>
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-60" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#F3F4F6] flex items-center justify-center">
              <Package className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-foreground mt-4">No shipments yet</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xs mx-auto">
              Create your first shipment to get started.
            </p>
            <Button
              className="bg-[lab(34.0831_-9.57756_-27.7093)] hover:bg-[#2F4468] rounded-lg h-10 px-5 mt-5"
              onClick={() => setLocation('/create')}
              data-testid="button-orders-create"
            >
              <Send className="w-4 h-4 mr-2" />
              Create shipment
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            {/* Desktop column headers */}
            <div className="hidden md:grid md:grid-cols-[1.6fr_1.7fr_1.2fr_0.9fr_0.7fr_auto] md:gap-x-6 md:px-4 md:py-2.5 md:text-[10px] md:font-bold md:tracking-[0.12em] md:uppercase md:text-muted-foreground md:border-b md:border-border md:bg-[#F8F9FA]">
              <span>AWB number</span>
              <span>Recipient</span>
              <span>Service</span>
              <span>Booked</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-border">
              {items.map((row) => (
                <ShipmentRow
                  key={`${row.awb_number}-${row.created_at}`}
                  item={row}
                  onOpen={openShipment}
                  onCopy={copyAwb}
                />
              ))}
            </div>
          </div>
        )}

        {/* Helper footnote */}
        {!loading && items.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center">
            Showing {items.length} {items.length === 1 ? 'shipment' : 'shipments'} · Tap any row for details
          </p>
        )}
      </main>

      <BottomNav />

      {/* CSV preview overlay (unchanged) */}
      {csvOverlayData && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col" data-testid="csv-preview">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-white safe-top shrink-0">
            <span className="font-semibold text-sm text-foreground">Shipment export</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => void handleShareCSV()}
                className="text-sm font-medium text-[#F2A123] hover:underline"
              >
                Share
              </button>
              <button
                type="button"
                onClick={() => {
                  setCsvOverlayData(null);
                  setCsvOverlayBlob(null);
                }}
                className="text-sm font-medium text-foreground hover:underline"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
            {(() => {
              const records = parseCsvRecords(csvOverlayData);
              const dataRows = records.slice(1).filter((r) => r.length > 1);
              if (dataRows.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center mt-8">No shipments found.</p>
                );
              }
              return dataRows.map((cols, i) => {
                const awb = cols[0] ?? '—';
                const booked = cols[1] ?? '—';
                const service = cols[2] ?? '—';
                const destCity = cols[4] ?? '';
                const destCountry = cols[5] ?? '';
                const destination = [destCity, destCountry].filter(Boolean).join(', ') || '—';
                const consignee = cols[6] ?? '—';
                const rawStatus = cols[12] ?? '—';
                const hasStatus = rawStatus.trim() !== '' && rawStatus !== '—';
                return (
                  <div
                    key={`${awb}-${i}`}
                    className="rounded-lg border border-border p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground break-all">{awb}</span>
                      <StatusBadge
                        status={hasStatus ? getStatusLabel(rawStatus) : 'Unknown'}
                        tone={hasStatus ? getStatusColor(rawStatus) : 'gray'}
                        className="shrink-0"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{consignee} · {destination}</p>
                    <p className="text-[11px] text-muted-foreground">{service} · {booked}</p>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

