import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Package, Copy, Send, Search, ArrowRight, Download } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const text =
    csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

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
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(field);
        field = '';
      } else if (ch === '\r') {
        // skip
      } else if (ch === '\n') {
        fields.push(field);
        field = '';
        records.push(fields);
        fields = [];
      } else {
        field += ch;
      }
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

  const formatInr = (amount: string | number | null, currency: string | null) => {
    if (amount === null || amount === undefined) return null;
    const n = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!Number.isFinite(n)) return null;
    const cur = (currency ?? 'INR').toUpperCase();
    if (cur === 'INR' || cur === '₹') {
      return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    }
    return `${cur} ${n.toLocaleString()}`;
  };

  const submitTrack = () => {
    const t = trackingInput.trim();
    if (t) {
      setLocation(`/shipment/${encodeURIComponent(t)}`);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const res = await fetch('/api/shipments/download-csv', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');

      const blob = await res.blob();
      const text = await blob.text();
      if (!text.trim()) {
        toast({
          title: 'No export data',
          description: 'No shipments found to export.',
        });
        return;
      }

      setCsvOverlayBlob(blob);
      setCsvOverlayData(text);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('CSV fetch failed:', err);
      toast({
        title: 'Export failed',
        description: 'Could not generate the export. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleShareCSV = async () => {
    if (!csvOverlayBlob || !csvOverlayData) return;

    const filename =
      'bombino-shipments-' + new Date().toISOString().split('T')[0] + '.csv';
    const file = new File([csvOverlayBlob], filename, { type: 'text/csv' });

    try {
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: 'Bombino Shipments',
        });
      } else {
        await navigator.clipboard.writeText(csvOverlayData);
        toast({
          title: 'Copied to clipboard',
          description: 'CSV data copied. Paste into any spreadsheet app.',
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Share failed:', err);
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

      <main className="px-4 py-5 max-w-md mx-auto">
        <div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-5 shadow-[0_8px_32px_rgba(198,40,40,0.10)] mb-6"
          data-testid="zone-orders-track"
        >
          <div className="relative z-10">
            <h2 className="text-lg font-semibold text-foreground mb-1">Track Your Shipment</h2>
            <p className="text-sm text-muted-foreground mb-4">Enter AWB number to get real-time status</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="e.g. BMB123456789"
                  className="h-12 pl-10 text-sm bg-white border-border rounded-xl shadow-sm"
                  onKeyDown={(e) => e.key === 'Enter' && submitTrack()}
                  data-testid="input-tracking-orders"
                />
              </div>
              <Button
                type="button"
                onClick={submitTrack}
                className="h-12 px-5 bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/25 active:scale-[0.97] transition-all font-semibold"
                data-testid="button-track-orders"
              >
                Track
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-1">
          <h1 className="text-lg font-semibold text-foreground">My Shipments</h1>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Track your outgoing and incoming shipments
        </p>

        {!isLoggedIn ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground mb-4">Sign in to view your shipments.</p>
            <Button className="bg-primary" onClick={() => setLocation('/login')}>
              Login
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-border p-4 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-primary/12 to-primary/6 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground mb-2">No shipments yet</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Create your first shipment to get started
            </p>
            <Button
              className="bg-primary hover:bg-primary/90 rounded-xl h-11 px-6 shadow-md"
              onClick={() => setLocation('/create')}
              data-testid="button-orders-create"
            >
              <Send className="w-4 h-4 mr-2" />
              Create Shipment
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => {
              const awb = row.awb_number;
              const amountStr = formatInr(row.total_amount, row.currency);
              return (
                <button
                  key={`${awb}-${row.created_at}`}
                  type="button"
                  onClick={() => setLocation(`/shipment/${encodeURIComponent(awb)}`)}
                  className="w-full text-left card-accent hover:border-primary/25 active:scale-[0.99] transition-all"
                  data-testid={`order-card-${awb}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold tabular-nums text-sm text-foreground truncate">{awb}</span>
                      <button
                        type="button"
                        onClick={(e) => copyAwb(e, awb)}
                        className="p-1.5 rounded-lg hover:bg-muted shrink-0"
                        aria-label="Copy AWB"
                      >
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <StatusBadge
                      status={
                        row.current_status != null && row.current_status.trim() !== ''
                          ? getStatusLabel(row.current_status)
                          : 'Unknown'
                      }
                      tone={
                        row.current_status != null && row.current_status.trim() !== ''
                          ? getStatusColor(row.current_status)
                          : 'gray'
                      }
                      className="shrink-0"
                    />
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {row.consignee_name ?? '—'}
                    {row.consignee_city ? (
                      <>
                        {' '}
                        · {row.consignee_city}
                      </>
                    ) : null}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span className="truncate">{row.service_name ?? '—'}</span>
                    {amountStr ? <span className="tabular-nums shrink-0 ml-2">{amountStr}</span> : null}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Booked {formatBookingDate(row.booking_date)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />

      {csvOverlayData && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-white safe-top shrink-0">
            <span className="font-semibold text-sm text-foreground">Shipment Export</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => void handleShareCSV()}
                className="text-sm text-[#14567C] font-medium"
              >
                Share
              </button>
              <button
                type="button"
                onClick={() => {
                  setCsvOverlayData(null);
                  setCsvOverlayBlob(null);
                }}
                className="text-sm text-muted-foreground font-medium"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
                const destination =
                  [destCity, destCountry].filter(Boolean).join(', ') || '—';
                const consignee = cols[6] ?? '—';
                const rawStatus = cols[12] ?? '—';
                const hasStatus = rawStatus.trim() !== '' && rawStatus !== '—';
                return (
                  <div
                    key={`${awb}-${i}`}
                    className="bg-card rounded-xl border border-border p-3 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground break-all">{awb}</span>
                      <StatusBadge
                        status={hasStatus ? getStatusLabel(rawStatus) : 'Unknown'}
                        tone={hasStatus ? getStatusColor(rawStatus) : 'gray'}
                        className="shrink-0"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">To: {destination}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{service}</span>
                      <span className="text-xs text-muted-foreground">{booked}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{consignee}</div>
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
