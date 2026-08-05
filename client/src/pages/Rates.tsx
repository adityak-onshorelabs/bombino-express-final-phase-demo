import type { CSSProperties } from 'react';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Info, Loader2, AlertTriangle, Phone } from 'lucide-react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { BottomNav } from '@/components/BottomNav';
import { DocPage } from '@/components/doc/DocPage';
import { SideMenu } from '@/components/SideMenu';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import whatsAppLogo from '@/assets/WhatsApp.svg.png';
import { COUNTRY_LIST, COUNTRY_MAP, isBookableCorridor } from '@/lib/countryData';
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
  ori_city?: string;
  ori_pincode?: string;
  dest_city?: string;
  dest_pincode?: string;
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

const BOMBINO_BLUE = '#14567C';
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

/** Title-case ALL CAPS country names from ITD list for display. */
function formatCountryDisplay(raw: string): string {
  return raw.toLowerCase().replace(/(^|[\s,]+)([a-z])/g, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
}

interface CountryComboboxProps {
  value: string;
  onValueChange: (code: string) => void;
}

function CountryCombobox({ value, onValueChange }: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const displayName = formatCountryDisplay(COUNTRY_MAP[value] ?? value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="doc-field w-full justify-between font-medium text-sm px-3 hover:bg-muted/40"
        >
          <span className="truncate text-left">{displayName}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandInput placeholder="Search country…" className="h-11" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRY_LIST.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.code}`}
                  onSelect={() => {
                    onValueChange(c.code);
                    setOpen(false);
                  }}
                >
                  {formatCountryDisplay(c.name)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Rates() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('kg');
  const [weight, setWeight] = useState('2');
  const [pieces, setPieces] = useState('1');
  const [originPincode, setOriginPincode] = useState('');
  const [destPincode, setDestPincode] = useState('');

  const [rateResults, setRateResults] = useState<ITDRateRow[] | null>(null);
  const [shipmentMeta, setShipmentMeta] = useState<ShipmentMeta | null>(null);
  const [apiError, setApiError] = useState('');
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [selectedRate, setSelectedRate] = useState<ITDRateRow | null>(null);

  const [selectedOrigin, setSelectedOrigin] = useState('IN');
  const [selectedDestination, setSelectedDestination] = useState('US');

  const clearRatesOnCorridorChange = (): void => {
    setRateResults(null);
    setShipmentMeta(null);
    setSelectedRate(null);
    setApiError('');
    setExpandedById({});
    setOriginPincode('');
    setDestPincode('');
  };

  const handleOriginChange = (code: string): void => {
    setSelectedOrigin(code);
    clearRatesOnCorridorChange();
  };

  const handleDestinationChange = (code: string): void => {
    setSelectedDestination(code);
    clearRatesOnCorridorChange();
  };

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
      destination_code: selectedDestination,
      booking_date: new Date().toISOString().split('T')[0],
      origin_code: selectedOrigin,
      pcs: String(parseInt(pieces) || 1),
      actual_weight: String(weightKg.toFixed(2)),
      ori_city: 'MUMBAI',
      ori_pincode: originPincode.trim() || '400001',
      ...(destPincode.trim() ? { dest_pincode: destPincode.trim() } : {}),
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

    const bookable = isBookableCorridor(selectedOrigin, selectedDestination);
    const corridorLabel = `${formatCountryDisplay(COUNTRY_MAP[selectedOrigin] ?? selectedOrigin)} → ${formatCountryDisplay(COUNTRY_MAP[selectedDestination] ?? selectedDestination)}`;

    return (
      <div
        className="min-h-[100dvh] pb-nav bg-background"
        data-testid="screen-rates-results"
      >
        {/* Centered content wrapper — constrains width on desktop, transparent on mobile */}
        <div className="max-w-2xl mx-auto w-full px-4 md:px-6 md:py-6">
          <header className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:pt-0 md:pb-5">
            <div className="flex items-center gap-2 md:mb-4">
              <button
                type="button"
                onClick={handleBack}
                className="p-2 -ml-2 rounded-lg hover:bg-black/[0.04] transition-colors"
                data-testid="button-back-rates"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
              <h1 className="text-base font-medium text-foreground tracking-tight md:text-2xl md:font-bold md:text-foreground">Rate options</h1>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 md:gap-2.5 md:mt-3">
              <span className="inline-flex items-center rounded-full bg-white border border-border px-3 py-[5px] text-[12px] text-foreground md:px-3.5 md:py-1.5 md:text-xs md:font-medium">
                <span className="font-mono">{weightKgLabel}</span>
              </span>
              <span className="inline-flex items-center rounded-full bg-white border border-border px-3 py-[5px] text-[12px] text-foreground md:px-3.5 md:py-1.5 md:text-xs md:font-medium">
                <span className="font-mono">{piecesLabel}</span>
              </span>
              <span className="inline-flex items-center rounded-full bg-white border border-border px-3 py-[5px] text-[12px] font-medium text-foreground md:px-3.5 md:py-1.5 md:text-xs">
                {corridorLabel}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground md:text-xs">
              <span><span className="font-mono">{displayRates.length}</span> services available</span>
              <span>sorted by lowest price</span>
            </div>
          </header>

          <main className="pb-2 md:pb-8">
            {!bookable ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-950">Online booking not available</p>
                    <p className="text-xs text-amber-800/90 mt-1 leading-snug">
                      For this corridor, please contact us to create your shipment.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <a
                        href="https://api.whatsapp.com/send?phone=917045999553"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 active:scale-[0.98] transition-colors"
                      >
                        <img src={whatsAppLogo} alt="" className="w-4 h-4 object-contain" />
                        WhatsApp
                      </a>
                      <a
                        href="tel:+912266400000"
                        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border border-amber-300 bg-white text-amber-950 text-xs font-medium hover:bg-amber-100/80 active:scale-[0.98] transition-colors"
                      >
                        <Phone className="w-4 h-4" aria-hidden />
                        Call
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
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
                    className="doc-card overflow-hidden p-0"
                    data-testid={`rate-card-${idx}`}
                  >
                    <div className="flex items-center gap-3 px-4 pt-4 pb-3 md:px-6 md:pt-5 md:pb-4 md:gap-4">
                      <div
                        className="w-9 h-9 shrink-0 flex items-center justify-center text-[13px] font-semibold text-white md:w-11 md:h-11 md:text-base"
                        style={{
                          backgroundColor: isBest ? BEST_GREEN : '#2F4468',
                          borderRadius: 'var(--doc-radius)',
                        }}
                      >
                        {letter}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground leading-snug md:text-base">{displayName}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-muted-foreground font-mono md:text-xs">
                            {weightStr} kg chargeable
                          </span>
                          {isBest && (
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
                              style={{ backgroundColor: BEST_BADGE_BG, color: BEST_GREEN }}
                            >
                              Best value
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[20px] font-semibold tabular-nums font-mono text-secondary md:text-2xl">
                          {formatInr(service.total)}
                        </p>
                        <p className="doc-label">incl. GST</p>
                      </div>
                    </div>

                    <div className="h-px bg-[#E2E8F0]" />

                    <button
                      type="button"
                      onClick={toggle}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-background transition-colors md:px-6 md:py-3"
                    >
                      <span className="text-[11px] text-muted-foreground md:text-xs">
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
                      <div className="bg-background px-4 py-4 border-t border-border md:px-6 md:py-5">
                        <div className="space-y-2.5">
                          <div className="flex justify-between gap-3 text-[11px] md:text-xs">
                            <span className="text-muted-foreground">Base rate</span>
                            <span className="font-medium tabular-nums font-mono">{formatInr(service.rate)}</span>
                          </div>
                          {service.fsc !== 0 && (
                            <div className="flex justify-between gap-3 text-[11px] md:text-xs">
                              <span className="text-muted-foreground">Fuel surcharge (FSC)</span>
                              <span className="font-medium tabular-nums font-mono">{formatInr(service.fsc)}</span>
                            </div>
                          )}
                          {!itemizedEmpty &&
                            Object.values(service.chrage_apply_data!)
                              .filter((entry) => entry.amount !== 0)
                              .map((entry, i) => (
                                <div key={`${service.id}-chg-${i}`} className="flex justify-between gap-3 text-[11px] md:text-xs">
                                  <span className="text-muted-foreground">{entry.name}</span>
                                  <span className="font-medium tabular-nums font-mono">{formatInr(entry.amount)}</span>
                                </div>
                              ))}
                          {showOtherChargesAggregate && (
                            <div className="flex justify-between gap-3 text-[11px] md:text-xs">
                              <span className="text-muted-foreground">Other charges</span>
                              <span className="font-medium tabular-nums font-mono">{formatInr(service.other_charges)}</span>
                            </div>
                          )}
                        </div>

                        <div className="my-3 h-px bg-[#E2E8F0]" />

                        <div className="space-y-2.5">
                          {service.sub_total !== 0 && (
                            <div className="flex justify-between gap-3 text-[11px] md:text-xs">
                              <span className="text-muted-foreground">Sub-total</span>
                              <span className="font-medium tabular-nums font-mono">{formatInr(service.sub_total)}</span>
                            </div>
                          )}
                          {gstTotal !== 0 && (
                            <div className="flex justify-between gap-3 text-[11px] md:text-xs">
                              <span className="text-muted-foreground">
                                GST ({service.gst_per || '0'}%)
                              </span>
                              <span className="font-medium tabular-nums font-mono">{formatInr(gstTotal)}</span>
                            </div>
                          )}
                        </div>

                        <div className="my-3 h-px bg-[#E2E8F0]" />

                        <div className="flex justify-between gap-3 items-baseline">
                          <span className="text-[11px] text-foreground font-semibold md:text-xs">Total payable</span>
                          <span className="text-[14px] font-semibold tabular-nums font-mono text-secondary md:text-base">
                            {formatInr(service.total)}
                          </span>
                        </div>

                        {bookable ? (
                          <button
                            type="button"
                            className="doc-btn-cta mt-3 w-full h-10 text-[13px] active:scale-[0.98] md:h-12 md:text-sm md:mt-4"
                            onClick={() => handleBookRate(service)}
                          >
                            Book this rate
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="doc-label">
              Rates are indicative and subject to change based on actual shipment weight and dimensions at the time of pickup. Final charges may vary.
            </p>
          </main>
        </div>

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
    <>
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <DocPage title="Rates" onMenuClick={() => setMenuOpen(true)} testId="screen-rates">
        <p className="text-sm text-muted-foreground">
          Instant rates for international shipments from India.
        </p>

        {/* One form, not three cards.
            A rate quote is a single continuous act: route, then shipment, then
            an optional refinement. Boxing each group put a frame around every
            two fields and made a short form read as several unrelated ones.
            Hairline rules and a heading carry the same grouping for free, and
            match how a printed shipping form is actually laid out. */}
        <div className="doc-group">
          <h2 className="doc-heading">Route</h2>
          <div className="flex items-end gap-2 mt-3">
            <div className="flex-1 min-w-0">
              <Label className="doc-label mb-1.5">From</Label>
              <CountryCombobox value={selectedOrigin} onValueChange={handleOriginChange} />
            </div>
            <div className="flex shrink-0 pb-3.5 text-muted-foreground" aria-hidden>
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <Label className="doc-label mb-1.5">To</Label>
              <CountryCombobox
                value={selectedDestination}
                onValueChange={handleDestinationChange}
              />
            </div>
          </div>
        </div>

        <div className="doc-group">
          <div className="flex items-center justify-between gap-3">
            <h2 className="doc-heading">Shipment</h2>
            <div className="doc-segment w-[96px]" role="tablist" aria-label="Weight unit">
              {(['lb', 'kg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="tab"
                  aria-selected={weightUnit === u}
                  onClick={() => setWeightUnit(u)}
                  className={cn(
                    weightUnit === u
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-card text-muted-foreground hover:bg-muted',
                  )}
                  data-testid={`button-weight-unit-${u}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label htmlFor="rate-weight" className="doc-label mb-1.5">
                Weight
              </Label>
              <div className="relative">
                <Input
                  id="rate-weight"
                  type="text"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="0"
                  className="doc-field doc-mono text-sm tabular-nums pr-10"
                  data-testid="input-weight"
                />
                {/* Unit inside the field: it belongs to the number, and a
                    caption underneath was one more line to scan. */}
                <span className="doc-mono absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {weightUnit}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="rate-pieces" className="doc-label mb-1.5">
                Pieces
              </Label>
              <Input
                id="rate-pieces"
                type="text"
                inputMode="numeric"
                value={pieces}
                onChange={(e) => setPieces(e.target.value)}
                placeholder="1"
                className="doc-field doc-mono text-sm tabular-nums"
                data-testid="input-pieces"
              />
            </div>
          </div>
        </div>

        <div className="doc-group">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="doc-heading">Pincodes</h2>
            <span className="doc-label">Optional</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Supplying both gives a more accurate rate.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label htmlFor="rate-origin-pin" className="doc-label mb-1.5">
                From
              </Label>
              <Input
                id="rate-origin-pin"
                type="text"
                inputMode="numeric"
                value={originPincode}
                onChange={(e) => setOriginPincode(e.target.value)}
                placeholder="400001"
                maxLength={10}
                className="doc-field doc-mono text-sm"
                data-testid="input-origin-pincode"
              />
            </div>
            <div>
              <Label htmlFor="rate-dest-pin" className="doc-label mb-1.5">
                To
              </Label>
              <Input
                id="rate-dest-pin"
                type="text"
                inputMode="numeric"
                value={destPincode}
                onChange={(e) => setDestPincode(e.target.value)}
                placeholder="10001"
                maxLength={10}
                className="doc-field doc-mono text-sm"
                data-testid="input-dest-pincode"
              />
            </div>
          </div>
        </div>

        {apiError && (
          <div
            role="alert"
            className="flex items-start gap-2 bg-destructive/5 border border-destructive/30 p-3 mt-6"
            style={{ borderRadius: 'var(--doc-radius)' }}
          >
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{apiError}</p>
          </div>
        )}

        <Button
          onClick={handleGetRates}
          disabled={rateMutation.isPending}
          className="doc-btn-cta w-full h-12 text-xs uppercase tracking-[0.1em] mt-7"
          data-testid="button-get-rates"
        >
          {rateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Getting rates</span>
            </>
          ) : (
            <>
              Get Rates
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </>
          )}
        </Button>

        {/* Shown on every size now, not desktop-only: the caveat matters most
            to someone booking on a phone, which is where it was hidden. */}
        <p className="doc-rule text-xs text-muted-foreground leading-relaxed mt-7 pt-4">
          Rates include GST and fuel surcharge. Final charges may vary based on actual weight
          and dimensions at pickup.
        </p>
      </DocPage>

      <BottomNav />
    </>
  );
}

