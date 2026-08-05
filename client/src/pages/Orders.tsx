import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Package, Copy, Send, Search, ArrowRight, Download } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { SignedOutState } from '@/components/StateBlock';
import { DocPage } from '@/components/doc/DocPage';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/lib/store';
import { getStatusLabel, getStatusColor } from '@/lib/awbStatus';
import { fetchMergedShipmentRows, type DisplayRow } from '@/lib/shipmentRows';
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

// ─── Row (responsive) ───────────────────────────────────────────────────────
function ShipmentRow({
  row,
  onOpen,
  onCopy,
}: {
  row: DisplayRow;
  onOpen: (row: DisplayRow) => void;
  onCopy: (e: React.MouseEvent, id: string) => void;
}) {
  const { displayId, isOrder, recipient: recipientRaw, city, service, amountStr, statusLabel: status, statusTone: tone } = row;
  const recipient = recipientRaw || 'Unnamed recipient';
  const recipientLine = city ? `${recipient} · ${city}` : recipient;
  const bookingDate = formatBookingDate(row.bookingDate);

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="w-full text-left transition-colors md:grid md:grid-cols-[1.6fr_1.7fr_1.2fr_0.9fr_0.7fr_auto] md:gap-x-6 md:items-center md:px-4 md:py-3 md:hover:bg-muted/40"
      data-testid={`order-row-${displayId}`}
    >
      {/* ─── MOBILE CARD ─────────────────────────────────────────── */}
      <div
        className="md:hidden relative bg-card border border-border overflow-hidden transition-colors active:bg-muted/40"
        style={{ borderRadius: 'var(--doc-radius)' }}
      >
        <div className="relative px-4 py-3.5">
          {/* Header — AWB/Order number + status pill */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center min-w-0">
              {isOrder && (
                <span className="mr-1.5 shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Order
                </span>
              )}
              <span className="doc-mono font-semibold tabular-nums text-[15px] text-foreground truncate">
                {displayId}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => onCopy(e, displayId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onCopy(e as unknown as React.MouseEvent, displayId);
                }}
                className="ml-1 p-2 -my-1.5 rounded-md active:bg-muted shrink-0 cursor-pointer text-muted-foreground/60 hover:text-muted-foreground"
                aria-label={`Copy ${isOrder ? 'order number' : 'AWB'} ${displayId}`}
              >
                <Copy className="w-3.5 h-3.5" />
              </span>
            </div>
            <StatusBadge status={status} tone={tone} className="shrink-0 mt-0.5" />
          </div>

          {/* Recipient — primary line */}
          <p className="mt-2 text-[14px] leading-snug truncate">
            <span className={recipientRaw ? 'font-semibold text-foreground' : 'text-muted-foreground italic'}>
              {recipient}
            </span>
            {city && <span className="text-muted-foreground/90 font-normal">{' · '}{city}</span>}
          </p>

          {/* Meta footer — hairline above, service + date + amount */}
          {(service || amountStr || bookingDate !== '—') && (
            <div className="mt-3 pt-2.5 border-t border-dashed border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {service && (
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent truncate">
                    {service}
                  </span>
                )}
                {service && bookingDate !== '—' && (
                  <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30 shrink-0" aria-hidden />
                )}
                {bookingDate !== '—' && (
                  <span className="text-[11.5px] text-muted-foreground tabular-nums shrink-0">
                    {bookingDate}
                  </span>
                )}
              </div>
              {amountStr && (
                <span className="text-[13px] font-bold tabular-nums text-foreground shrink-0">
                  {amountStr}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── DESKTOP COLUMNS (unchanged) ──────────────────────────── */}
      <div className="hidden md:flex md:items-center md:gap-2 md:min-w-0">
        {isOrder && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Order
          </span>
        )}
        <span className="font-semibold tabular-nums text-sm text-foreground truncate">{displayId}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => onCopy(e, displayId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onCopy(e as unknown as React.MouseEvent, displayId);
          }}
          className="p-1 rounded hover:bg-muted shrink-0 cursor-pointer"
          aria-label={`Copy ${isOrder ? 'order number' : 'AWB'} ${displayId}`}
        >
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        </span>
      </div>
      <p className="hidden md:block text-sm text-foreground/80 truncate">{recipientLine}</p>
      <span className="hidden md:block text-sm text-muted-foreground truncate">{service || '—'}</span>
      <span className="hidden md:block text-sm text-muted-foreground tabular-nums">{bookingDate}</span>
      <span className="hidden md:block text-sm tabular-nums text-right text-foreground/80">{amountStr ?? '—'}</span>
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
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvOverlayData, setCsvOverlayData] = useState<string | null>(null);
  const [csvOverlayBlob, setCsvOverlayBlob] = useState<Blob | null>(null);

  const loadHistory = useCallback(async () => {
    if (!isLoggedIn) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchMergedShipmentRows());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const copyId = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard.writeText(id);
    toast({ title: 'Copied', description: id });
  };

  const submitTrack = () => {
    const t = trackingInput.trim();
    if (t) setLocation(`/shipment/${encodeURIComponent(t)}`);
  };

  // An order and a shipment are the same thing at different stages, but they
  // are keyed differently — an order has only its BOM number until ops issues
  // an AWB — so each gets its own detail screen.
  const openRow = (row: DisplayRow) => {
    const path = row.isOrder ? '/order' : '/shipment';
    setLocation(`${path}/${encodeURIComponent(row.displayId)}`);
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
    <>
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <DocPage title="Shipments" onMenuClick={() => setMenuOpen(true)} testId="screen-orders">
        {/* Look up any AWB, including one not on this account. This is the
            single home for tracking now — /track and /receive both redirect
            here, because "where is my stuff?" was being answered by two tabs
            and a customer had to guess which one held a given shipment. */}
        <div className="doc-panel" data-testid="zone-track">
          <h2 className="doc-label">Track any order</h2>
          <div className="flex gap-2 mt-3">
            <div
              className="flex flex-1 items-stretch border border-border bg-card focus-within:border-accent transition-colors min-w-0"
              style={{ borderRadius: 'var(--doc-radius)' }}
            >
              <span className="flex items-center pl-3 text-muted-foreground">
                <Search className="w-4 h-4" />
              </span>
              <Input
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="AWB number"
                className="doc-mono h-12 flex-1 min-w-0 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 rounded-none"
                onKeyDown={(e) => e.key === 'Enter' && submitTrack()}
                data-testid="input-track-awb"
              />
            </div>
            <Button
              onClick={submitTrack}
              disabled={!trackingInput.trim()}
              className="doc-btn-cta h-12 px-5 shrink-0 text-xs uppercase tracking-[0.1em]"
              data-testid="button-track-submit"
            >
              Track
            </Button>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 mt-7">
          <p className="doc-label">
            {isLoggedIn && !loading && rows.length > 0
              ? `${rows.length} shipment${rows.length === 1 ? '' : 's'}`
              : 'Outgoing and incoming'}
          </p>
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className="doc-link focus-ring shrink-0"
              data-testid="button-export-csv"
            >
              <Download className="w-3 h-3 shrink-0" />
              Export CSV
            </button>
          )}
        </div>

        {/* Body */}
        {!isLoggedIn ? (
          <SignedOutState
            icon={Package}
            title="Sign in to see your shipments"
            description="Your bookings and their live status appear here once you're signed in."
            redirectTo="/orders"
            testId="state-orders-signed-out"
          />
        ) : loading ? (
          <>
            <p className="sr-only" role="status">
              Loading your shipments
            </p>
            {/* Mobile skeleton.
                A skeleton's only job is to predict the layout that replaces
                it, so this mirrors the real row: same border, same 6px radius,
                same px-4/py-3.5, same three lines in the same places. The
                previous one was a 2xl card with pill placeholders — it
                predicted a shape the list no longer has, so content visibly
                jumped when it resolved.

                Widths vary per row. A column of identical bars reads as a
                loading graphic; uneven ones read as text about to arrive. */}
            <div className="md:hidden space-y-2">
              {[
                { id: 'w-28', dest: 'w-44', meta: 'w-24' },
                { id: 'w-32', dest: 'w-36', meta: 'w-28' },
                { id: 'w-24', dest: 'w-48', meta: 'w-20' },
                { id: 'w-32', dest: 'w-40', meta: 'w-24' },
              ].map((w, i) => (
                <div
                  key={i}
                  className="border border-border bg-card px-4 py-3.5 animate-pulse"
                  style={{ borderRadius: 'var(--doc-radius)' }}
                  aria-hidden
                >
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className={`h-4 ${w.id} rounded-sm`} />
                    <Skeleton className="h-5 w-16 rounded-sm" />
                  </div>
                  <Skeleton className={`h-3.5 ${w.dest} rounded-sm mt-2.5`} />
                  <div className="mt-3 pt-2.5 border-t border-dashed border-border flex items-center justify-between gap-3">
                    <Skeleton className={`h-3 ${w.meta} rounded-sm`} />
                    <Skeleton className="h-3 w-14 rounded-sm" />
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop skeleton */}
            <div
              className="hidden md:block border border-border bg-card overflow-hidden"
              style={{ borderRadius: 'var(--doc-radius)' }}
              aria-hidden
            >
              {['w-40', 'w-52', 'w-36', 'w-48'].map((w, i) => (
                <div
                  key={i}
                  className={`px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''} space-y-2 animate-pulse`}
                >
                  <Skeleton className={`h-4 ${w} rounded-sm`} />
                  <Skeleton className="h-3 w-60 rounded-sm" />
                </div>
              ))}
            </div>
          </>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Package className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-foreground mt-4">No shipments yet</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xs mx-auto">
              Create your first shipment to get started.
            </p>
            <Button
              className="doc-btn-cta h-10 px-5 mt-5"
              onClick={() => setLocation('/create')}
              data-testid="button-orders-create"
            >
              <Send className="w-4 h-4 mr-2" />
              Create shipment
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile — stack of cards */}
            <div className="md:hidden space-y-2.5">
              {rows.map((row) => (
                <ShipmentRow key={`m-${row.key}`} row={row} onOpen={openRow} onCopy={copyId} />
              ))}
            </div>

            {/* Desktop — single bordered table */}
            <div className="hidden md:block rounded-xl border border-border bg-white overflow-hidden">
              <div className="grid grid-cols-[1.6fr_1.7fr_1.2fr_0.9fr_0.7fr_auto] gap-x-6 px-4 py-2.5 text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground border-b border-border bg-background">
                <span>AWB / Order number</span>
                <span>Recipient</span>
                <span>Service</span>
                <span>Booked</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-border">
                {rows.map((row) => (
                  <ShipmentRow key={`d-${row.key}`} row={row} onOpen={openRow} onCopy={copyId} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Helper footnote */}
        {!loading && rows.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center">
            Showing {rows.length} {rows.length === 1 ? 'shipment' : 'shipments'} · Tap any row for details
          </p>
        )}
      </DocPage>

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
                className="text-sm font-medium text-accent hover:underline"
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
    </>
  );
}
