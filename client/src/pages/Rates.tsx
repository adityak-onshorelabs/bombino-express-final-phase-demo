import type { CSSProperties } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { CorridorRouteInfo } from '@/components/CorridorRouteInfo';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { lbToKg, kgToLb } from '@/lib/mockData';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

interface RateParams {
  product_code: string;
  destination_code: string;
  booking_date: string;
  origin_code: string;
  pcs: string;
  actual_weight: string;
}

interface ITDChargeApplyEntry {
  name: string;
  amount: number;
}

interface ITDRateRow {
  id: string;
  code: string;
  rate: number;
  fsc: number;
  cgst: number;
  sgst: number;
  other_charges: number;
  chrage_apply_data?: Record<string, ITDChargeApplyEntry>;
  sub_total: number;
  total: number;
  per_kg: number;
  weight: string;
  gst_per: string;
  internal_api_service_code?: string;
}

interface ITDRateResponse {
  success?: boolean;
  data?: ITDRateRow[];
}

interface ShipmentMeta {
  weightLb: number;
  weightKg: number;
  pieces: number;
}

/** Indian Rupee with sensible fraction digits (no float noise). */
function formatInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const BOMBINO_RED = '#b91c1c';
const BEST_GREEN = '#166534';
const BEST_BADGE_BG = '#dcfce7';

const ratesResultsShellStyle = {
  '--color-background-primary': '#ffffff',
  '--color-background-secondary': 'rgb(247 247 249)',
  '--color-border-tertiary': 'rgba(55, 65, 81, 0.12)',
} as CSSProperties;

function normalizeRateRow(raw: unknown): ITDRateRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r.id != null ? String(r.id) : '';
  const code =
    typeof r.code === 'string'
      ? r.code
      : typeof r.internal_api_service_code === 'string'
        ? r.internal_api_service_code
        : '';
  if (!id && !code) return null;
  const num = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) || 0);
  const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
  let chrage = r.chrage_apply_data;
  if (chrage && typeof chrage === 'object' && !Array.isArray(chrage)) {
    chrage = chrage as Record<string, ITDChargeApplyEntry>;
  } else {
    chrage = undefined;
  }
  return {
    id: id || code,
    code: code || id,
    rate: num(r.rate),
    fsc: num(r.fsc),
    cgst: num(r.cgst),
    sgst: num(r.sgst),
    other_charges: num(r.other_charges),
    chrage_apply_data: chrage as ITDRateRow['chrage_apply_data'],
    sub_total: num(r.sub_total),
    total: num(r.total),
    per_kg: num(r.per_kg),
    weight: str(r.weight),
    gst_per: str(r.gst_per),
    internal_api_service_code:
      typeof r.internal_api_service_code === 'string' ? r.internal_api_service_code : undefined,
  };
}

function dedupeAndSort(rows: ITDRateRow[]): ITDRateRow[] {
  const seen = new Set<string>();
  const deduped: ITDRateRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return [...deduped].sort((a, b) => a.total - b.total);
}

function itemizedChargesEmpty(service: ITDRateRow): boolean {
  const d = service.chrage_apply_data;
  return !d || Object.keys(d).length === 0;
}

export default function Rates() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('kg');
  const [weight, setWeight] = useState('2');
  const [pieces, setPieces] = useState('1');

  const [rateResults, setRateResults] = useState<ITDRateRow[] | null>(null);
  const [shipmentMeta, setShipmentMeta] = useState<ShipmentMeta | null>(null);
  const [apiError, setApiError] = useState('');
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [selectedRate, setSelectedRate] = useState<ITDRateRow | null>(null);

  const displayRates = useMemo(() => {
    if (!rateResults?.length) return [];
    return dedupeAndSort(rateResults);
  }, [rateResults]);

  useLayoutEffect(() => {
    if (displayRates.length === 0) return;
    const bestId = displayRates[0].id;
    setExpandedById({ [bestId]: true });
  }, [displayRates]);

  const rateMutation = useMutation({
    mutationFn: (params: RateParams) =>
      apiRequest('POST', '/api/rates', params).then((r) => r.json() as Promise<ITDRateResponse>),
    onSuccess: (data) => {
      const w = parseFloat(weight) || 1;
      const weightLb = weightUnit === 'lb' ? w : kgToLb(w);
      const weightKg = weightUnit === 'kg' ? w : lbToKg(w);

      const rawList: unknown[] = Array.isArray(data)
        ? (data as unknown[])
        : Array.isArray(data?.data)
          ? (data.data as unknown[])
          : [];

      const services: ITDRateRow[] = rawList
        .map((item) => normalizeRateRow(item))
        .filter((row): row is ITDRateRow => row !== null);

      if (services.length === 0) {
        setApiError('No rates available for this shipment.');
      } else {
        setShipmentMeta({
          weightLb: parseFloat(weightLb.toFixed(1)),
          weightKg: parseFloat(weightKg.toFixed(2)),
          pieces: parseInt(pieces) || 1,
        });
        setRateResults(services);
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, '') : 'Rate calculation failed';
      setApiError(msg);
    },
  });

  const handleGetRates = () => {
    setApiError('');
    const w = parseFloat(weight) || 1;
    const weightKg = weightUnit === 'kg' ? w : lbToKg(w);

    rateMutation.mutate({
      product_code: 'SPX',
      destination_code: 'US',
      booking_date: new Date().toISOString().split('T')[0],
      origin_code: 'IN',
      pcs: String(parseInt(pieces) || 1),
      actual_weight: String(weightKg.toFixed(2)),
    });
  };

  const handleBack = () => {
    if (rateResults) {
      setRateResults(null);
      setShipmentMeta(null);
    } else {
      setLocation('/home');
    }
  };

  const handleBookRate = (service: ITDRateRow) => {
    setSelectedRate(service);
    const q = encodeURIComponent(service.code);
    setLocation(`/create?api_service_code=${q}`);
  };

  if (rateResults && shipmentMeta) {
    const weightKgLabel = `${shipmentMeta.weightKg} kg`;
    const piecesLabel =
      shipmentMeta.pieces === 1 ? '1 piece' : `${shipmentMeta.pieces} pieces`;

    return (
      <div
        className="min-h-screen pb-20 bg-[var(--color-background-secondary)]"
        style={ratesResultsShellStyle}
        data-testid="screen-rates-results"
      >
        <header className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 -ml-2 rounded-lg hover:bg-black/[0.04] transition-colors"
              data-testid="button-back-rates"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-base font-medium text-foreground tracking-tight">Rate options</h1>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-white border-[0.5px] border-[var(--color-border-tertiary)] px-3 py-[5px] text-[12px] text-foreground">
              {weightKgLabel}
            </span>
            <span className="inline-flex items-center rounded-full bg-white border-[0.5px] border-[var(--color-border-tertiary)] px-3 py-[5px] text-[12px] text-foreground">
              {piecesLabel}
            </span>
            <span className="inline-flex flex-col justify-center rounded-full bg-white border-[0.5px] border-[var(--color-border-tertiary)] px-3 py-[5px] min-w-[10rem]">
              <span className="text-[12px] font-medium leading-tight">India → United States</span>
              <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                More corridors coming soon
              </span>
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>{displayRates.length} services available</span>
            <span>↑ lowest price first</span>
          </div>
        </header>

        <main className="px-4 max-w-md mx-auto pb-2">
          <div className="flex flex-col gap-[10px]">
            {displayRates.map((service, idx) => {
              const isBest = idx === 0;
              const displayName = service.code || service.internal_api_service_code || 'Service';
              const letter = displayName.trim().charAt(0).toUpperCase() || '?';
              const gstTotal = service.cgst + service.sgst;
              const open = !!expandedById[service.id];
              const weightStr = service.weight?.trim() || String(shipmentMeta.weightKg);
              const itemizedEmpty = itemizedChargesEmpty(service);
              const showOtherChargesAggregate =
                service.other_charges > 0 && itemizedEmpty;

              const toggle = () => {
                setExpandedById((prev) => ({
                  ...prev,
                  [service.id]: !prev[service.id],
                }));
              };

              return (
                <div
                  key={service.id}
                  className="rounded-[14px] border-[0.5px] border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] overflow-hidden"
                  data-testid={`rate-card-${idx}`}
                >
                  <div className="flex items-center gap-3 px-4 pt-[14px] pb-3">
                    <div
                      className="w-[34px] h-[34px] shrink-0 rounded-[10px] flex items-center justify-center text-[13px] font-medium text-white"
                      style={{ backgroundColor: isBest ? BEST_GREEN : BOMBINO_RED }}
                    >
                      {letter}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground leading-snug">{displayName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {weightStr} kg chargeable
                        </span>
                        {isBest && (
                          <span
                            className="inline-block rounded-[20px] px-[7px] py-0.5 text-[9px] font-medium"
                            style={{ backgroundColor: BEST_BADGE_BG, color: BEST_GREEN }}
                          >
                            Best value
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[20px] font-medium tabular-nums" style={{ color: BOMBINO_RED }}>
                        {formatInr(service.total)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">incl. GST</p>
                    </div>
                  </div>

                  <div className="h-[0.5px] bg-[var(--color-border-tertiary)]" />

                  <button
                    type="button"
                    onClick={toggle}
                    className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-black/[0.02] transition-colors"
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {open ? 'Hide breakdown' : 'View price breakdown'}
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-[11px] h-[11px] text-muted-foreground shrink-0 transition-transform duration-200',
                        open && 'rotate-180'
                      )}
                    />
                  </button>

                  {open && (
                    <div className="bg-[var(--color-background-secondary)] px-4 py-3 border-t-[0.5px] border-[var(--color-border-tertiary)]">
                      <div className="space-y-2">
                        <div className="flex justify-between gap-3 text-[11px]">
                          <span className="text-muted-foreground">Base rate</span>
                          <span className="font-medium tabular-nums">{formatInr(service.rate)}</span>
                        </div>
                        {service.fsc !== 0 && (
                          <div className="flex justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground">Fuel surcharge (FSC)</span>
                            <span className="font-medium tabular-nums">{formatInr(service.fsc)}</span>
                          </div>
                        )}
                        {!itemizedEmpty &&
                          Object.values(service.chrage_apply_data!)
                            .filter((entry) => entry.amount !== 0)
                            .map((entry, i) => (
                              <div key={`${service.id}-chg-${i}`} className="flex justify-between gap-3 text-[11px]">
                                <span className="text-muted-foreground">{entry.name}</span>
                                <span className="font-medium tabular-nums">{formatInr(entry.amount)}</span>
                              </div>
                            ))}
                        {showOtherChargesAggregate && (
                          <div className="flex justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground">Other charges</span>
                            <span className="font-medium tabular-nums">
                              {formatInr(service.other_charges)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="my-3 h-[0.5px] bg-[var(--color-border-tertiary)]" />

                      <div className="space-y-2">
                        {service.sub_total !== 0 && (
                          <div className="flex justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground">Sub-total</span>
                            <span className="font-medium tabular-nums">{formatInr(service.sub_total)}</span>
                          </div>
                        )}
                        {gstTotal !== 0 && (
                          <div className="flex justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground">
                              GST ({service.gst_per || '0'}%)
                            </span>
                            <span className="font-medium tabular-nums">{formatInr(gstTotal)}</span>
                          </div>
                        )}
                      </div>

                      <div className="my-3 h-px bg-[var(--color-border-tertiary)] opacity-80" />

                      <div className="flex justify-between gap-3 items-baseline">
                        <span className="text-[11px] text-muted-foreground">Total payable</span>
                        <span
                          className="text-[13px] font-medium tabular-nums"
                          style={{ color: BOMBINO_RED }}
                        >
                          {formatInr(service.total)}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="mt-[10px] w-full h-10 rounded-[10px] text-[13px] font-medium text-white transition-opacity hover:opacity-95 active:opacity-90"
                        style={{ backgroundColor: BOMBINO_RED }}
                        onClick={() => handleBookRate(service)}
                      >
                        Book this rate
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-muted-foreground text-center mt-6">
            Estimated only. Final charges may vary.
          </p>
        </main>

        {selectedRate ? (
          <span className="sr-only" aria-live="polite">
            Selected rate: {selectedRate.code}
          </span>
        ) : null}

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="screen-rates">
      <Header onMenuClick={() => setMenuOpen(true)} />
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="px-4 py-5 max-w-md mx-auto">
        <h1 className="text-lg font-semibold text-foreground mb-1">Get Rates</h1>
        <CorridorRouteInfo className="mb-5" />

        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-semibold">Weight</Label>
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setWeightUnit('lb')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    weightUnit === 'lb' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  lb
                </button>
                <button
                  onClick={() => setWeightUnit('kg')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    weightUnit === 'kg' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  kg
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Weight ({weightUnit})</Label>
                <Input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="2"
                  className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                  step="0.1"
                  min="0.1"
                  data-testid="input-weight"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Pieces</Label>
                <Input
                  type="number"
                  value={pieces}
                  onChange={(e) => setPieces(e.target.value)}
                  placeholder="1"
                  className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                  min="1"
                  data-testid="input-pieces"
                />
              </div>
            </div>
          </div>

          {apiError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{apiError}</p>
            </div>
          )}

          <Button
            onClick={handleGetRates}
            disabled={rateMutation.isPending}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-xl shadow-md disabled:opacity-70 mt-6 mb-4"
            data-testid="button-get-rates"
          >
            {rateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Get Rates'
            )}
          </Button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
