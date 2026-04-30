import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  ArrowLeft,
  Copy,
  Check,
  Plane,
  Download,
  Phone,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { BottomNav } from '@/components/BottomNav';
import { StatusBadge } from '@/components/StatusBadge';
import { TrackingTimeline } from '@/components/TrackingTimeline';
import type { TrackingEvent } from '@/lib/mockData';
import { getStatusLabel, getStatusColor } from '@/lib/awbStatus';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import whatsAppLogo from '@/assets/WhatsApp.svg.png';

interface DocketEvent {
  id?: string;
  event_at: string;
  event_description: string;
  event_remark: string;
  event_state: string;
  event_location: string;
}

interface ITDTrackingResult {
  errors: boolean;
  tracking_no: string;
  chargeable_weight: string;
  forwarding_no: string;
  docket_info: [string, string][];
  docket_events: DocketEvent[];
}

export type TrackingResponse =
  | {
      results: ITDTrackingResult[];
      fromCache: false;
      lastTrackedAt: string;
    }
  | {
      fromCache: true;
      lastTrackedAt: string;
      currentStatus: string;
      message: string;
    };

function getDocketValue(docketInfo: [string, string][], label: string): string {
  const entry = docketInfo.find(([key]) => key.trim() === label);
  return entry?.[1]?.trim() ?? '';
}

function joinLocationParts(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(', ');
}

function formatFieldValue(value: string): string {
  return value.trim();
}

function withKg(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /\bkg\b/i.test(trimmed) ? trimmed : `${trimmed} kg`;
}

function mapEvents(docketEvents: DocketEvent[]): TrackingEvent[] {
  return docketEvents.map((e, index) => ({
    id: e.id || `${e.event_at}-${index}`,
    status: e.event_description,
    note: e.event_remark || e.event_state || '',
    location: e.event_location || '',
    timestamp: new Date(e.event_at),
  }));
}

function isTrackingResponse(body: unknown): body is TrackingResponse {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  if (o.fromCache === true) {
    return (
      typeof o.lastTrackedAt === 'string' &&
      typeof o.currentStatus === 'string' &&
      typeof o.message === 'string'
    );
  }
  if (o.fromCache === false) {
    return Array.isArray(o.results) && typeof o.lastTrackedAt === 'string';
  }
  return false;
}

export default function ShipmentDetails() {
  const [, params] = useRoute('/shipment/:awb');
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const awb = params?.awb ? decodeURIComponent(params.awb) : '';

  const { data, isLoading, isFetching, error } = useQuery<TrackingResponse>({
    queryKey: ['/api/track', awb],
    queryFn: async () => {
      const res = await fetch(`/api/track/${encodeURIComponent(awb)}`, {
        credentials: 'include',
      });
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof body === 'object' &&
          body !== null &&
          'message' in body &&
          typeof (body as { message: unknown }).message === 'string'
            ? (body as { message: string }).message
            : res.statusText;
        throw new Error(`${res.status}: ${msg}`);
      }
      if (!isTrackingResponse(body)) {
        throw new Error('Invalid tracking response');
      }
      return body;
    },
    enabled: !!awb,
    retry: false,
  });

  const copyAWB = () => {
    void navigator.clipboard.writeText(awb);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLabel = async () => {
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(awb)}/label`, {
        credentials: 'include',
      });
      if (!res.ok) {
        toast({
          title: 'Label not available',
          description: 'The label for this shipment could not be found.',
          variant: 'destructive',
        });
        return;
      }

      const { label } = (await res.json()) as { label: string };
      const binary = atob(label);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `label-${awb}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not download the shipment label.',
        variant: 'destructive',
      });
    }
  };

  const invalidateTrack = () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/track', awb] });
  };

  const headerRefresh = (
    <button
      type="button"
      onClick={() => invalidateTrack()}
      disabled={isFetching}
      className="ml-auto p-2 rounded-full hover:bg-black/5 transition-colors disabled:opacity-50"
      aria-label="Refresh tracking"
      data-testid="button-refresh-tracking"
    >
      <RefreshCw
        size={18}
        className={cn('text-gray-600', isFetching && 'animate-spin')}
      />
    </button>
  );

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-nav" data-testid="screen-shipment-loading">
        <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
          <div className="flex items-center h-14 px-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="ml-2 font-semibold text-sm flex-1">Shipment Details</h1>
            {headerRefresh}
          </div>
        </header>
        <main className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] bg-background pb-nav" data-testid="screen-shipment-not-found">
        <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
          <div className="flex items-center h-14 px-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setLocation('/receive')}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="ml-2 font-semibold text-sm flex-1">Shipment Details</h1>
            {awb ? headerRefresh : null}
          </div>
        </header>
        <main className="px-4 py-12 max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Shipment Not Found</h2>
          <p className="text-sm text-muted-foreground mb-6">AWB: {awb}</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message.replace(/^\d+:\s*/, '') : 'No tracking data available'}
          </p>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (data.fromCache) {
    const rawState = data.currentStatus;
    return (
      <div className="min-h-[100dvh] bg-background pb-nav-strip" data-testid="screen-shipment-cached">
        <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
          <div className="flex items-center h-14 px-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="ml-2 font-semibold text-sm flex-1">Shipment Details</h1>
            {headerRefresh}
          </div>
        </header>

        <main className="max-w-md mx-auto">
          <div className="mx-4 mt-4 rounded-xl p-4 border border-amber-200 bg-amber-50">
            <p className="text-sm font-medium text-amber-800">Tracking temporarily unavailable</p>
            <p className="text-sm text-amber-700 mt-1">
              Last known status: {getStatusLabel(rawState)} · updated{' '}
              {formatDistanceToNow(new Date(data.lastTrackedAt), { addSuffix: true })}
            </p>
            <p className="text-xs text-amber-600 mt-1">{data.message}</p>
            <p className="text-xs text-amber-600 mt-1">Please check back later</p>
          </div>

          <div className="px-4 py-5">
            <div className="bg-card rounded-2xl border border-border p-4 mb-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">{awb}</span>
                    <button
                      type="button"
                      onClick={copyAWB}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      data-testid="button-copy-awb"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <StatusBadge
                    status={getStatusLabel(rawState)}
                    tone={getStatusColor(rawState)}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-amber-700 text-center">
              Last updated{' '}
              {formatDistanceToNow(new Date(data.lastTrackedAt), { addSuffix: true })}{' '}
              ·{' '}
              <button
                type="button"
                onClick={() => invalidateTrack()}
                className="text-primary font-medium"
              >
                Refresh
              </button>
            </p>
          </div>
        </main>

        <div className="fixed left-0 right-0 z-40 bg-white border-t border-border p-4 safe-bottom bottom-[var(--nav-stack)]">
          <div className="flex justify-end gap-2 max-w-md mx-auto">
            <a
              href="https://api.whatsapp.com/send?phone=917045999553"
              target="_blank"
              rel="noopener noreferrer"
              className="w-11 h-11 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center hover:bg-green-100 transition-colors"
              data-testid="button-whatsapp"
            >
              <img src={whatsAppLogo} alt="WhatsApp" className="w-5 h-5 object-contain" />
            </a>
            <a
              href="tel:+912266400000"
              className="w-11 h-11 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center hover:bg-primary/20 transition-colors"
              data-testid="button-call"
            >
              <Phone className="w-5 h-5 text-primary" />
            </a>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const trackingData = data.results[0];
  if (!trackingData || data.results.length === 0 || trackingData.errors) {
    return (
      <div className="min-h-[100dvh] bg-background pb-nav" data-testid="screen-shipment-not-found">
        <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
          <div className="flex items-center h-14 px-4 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setLocation('/receive')}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="ml-2 font-semibold text-sm flex-1">Shipment Details</h1>
            {headerRefresh}
          </div>
        </header>
        <main className="px-4 py-12 max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Shipment Not Found</h2>
          <p className="text-sm text-muted-foreground mb-6">AWB: {awb}</p>
          <p className="text-sm text-muted-foreground">No tracking data available</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const result = trackingData;
  const info = result.docket_info ?? [];
  const docketEvents = result.docket_events ?? [];
  const events = mapEvents(docketEvents);
  const lastEv = docketEvents.length > 0 ? docketEvents[docketEvents.length - 1] : undefined;
  const rawStateForBadge =
    (lastEv?.event_state?.trim() || getDocketValue(info, 'Status') || 'INTRANSIT').trim() ||
    'INTRANSIT';

  const currentStatus = getDocketValue(info, 'Status') || getStatusLabel(rawStateForBadge);
  const fromCountry = getDocketValue(info, 'Origin');
  const toCountry = getDocketValue(info, 'Destination');
  const fromCity = getDocketValue(info, 'Shipper City');
  const toCity = getDocketValue(info, 'Consignee City');
  const bookingDate = getDocketValue(info, 'Booking Date') || getDocketValue(info, 'Created');
  const serviceName = getDocketValue(info, 'Service Name');
  const chargeableWeight = withKg(result.chargeable_weight || getDocketValue(info, 'Chargeable Weight'));
  const shipperName = getDocketValue(info, 'Shipper Name');
  const shipperCompany = getDocketValue(info, 'Shipper Company');
  const consigneeName = getDocketValue(info, 'Consignee Name');
  const consigneeCompany = getDocketValue(info, 'Consignee Company');
  const consigneeState = getDocketValue(info, 'Consignee State');
  const consigneeCountry = getDocketValue(info, 'Consignee Country') || toCountry;
  const fromLine = joinLocationParts(fromCity, fromCountry);
  const toLine = joinLocationParts(toCity, toCountry);
  const consigneeLocation = joinLocationParts(toCity, consigneeState, consigneeCountry);
  const isHoldOrException = currentStatus === 'Customs Hold' || currentStatus === 'Exception';

  const shipmentInfoFields = [
    { label: 'AWB No.', value: formatFieldValue(getDocketValue(info, 'AWB No.') || result.tracking_no || awb) },
    { label: 'Booking Date', value: formatFieldValue(bookingDate) },
    { label: 'Service Name', value: formatFieldValue(serviceName) },
    { label: 'Status', value: formatFieldValue(currentStatus) },
    { label: 'Chargeable Weight', value: formatFieldValue(chargeableWeight) },
  ].filter((field) => field.value);

  const partyFields = [
    { label: 'Shipper Name', value: formatFieldValue(shipperName) },
    { label: 'Shipper Company', value: formatFieldValue(shipperCompany) },
    { label: 'Shipper City', value: formatFieldValue(fromCity) },
    { label: 'Consignee Name', value: formatFieldValue(consigneeName) },
    { label: 'Consignee Company', value: formatFieldValue(consigneeCompany) },
    { label: 'Consignee Location', value: formatFieldValue(consigneeLocation) },
  ].filter((field) => field.value);

  return (
    <div className="min-h-[100dvh] bg-background pb-nav-strip" data-testid="screen-shipment-details">
      <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
        <div className="flex items-center h-14 px-4 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="ml-2 font-semibold text-sm flex-1">Shipment Details</h1>
          {headerRefresh}
        </div>
      </header>

      <main className="px-4 py-5 max-w-md mx-auto">
        <div className="bg-card rounded-2xl border border-border p-4 mb-4 animate-fade-in shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{awb}</span>
                <button
                  type="button"
                  onClick={copyAWB}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  data-testid="button-copy-awb"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <StatusBadge
                status={getStatusLabel(rawStateForBadge)}
                tone={getStatusColor(rawStateForBadge)}
                className="mt-2"
              />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 mb-4 animate-fade-in shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">From</p>
              <p className="font-semibold text-sm">{fromLine || '—'}</p>
            </div>
            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center">
              <Plane className="w-5 h-5 text-primary rotate-45" />
            </div>
            <div className="flex-1 text-right">
              <p className="text-[10px] text-muted-foreground">To</p>
              <p className="font-semibold text-sm">{toLine || '—'}</p>
            </div>
          </div>
        </div>

        {isHoldOrException && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 mb-4 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-700 text-sm">{currentStatus}</h3>
                <p className="text-xs text-red-600 mt-1">Contact support for details.</p>
                <a
                  href="https://api.whatsapp.com/send?phone=917045999553"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-red-700"
                  data-testid="link-support-hold"
                >
                  <img src={whatsAppLogo} alt="WhatsApp" className="w-3.5 h-3.5 object-contain" />
                  Contact Support
                </a>
              </div>
            </div>
          </div>
        )}

        {events.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4 mb-4 shadow-sm">
            <h2 className="font-semibold text-sm text-foreground mb-3">Tracking History</h2>
            <TrackingTimeline events={events} currentStatus={currentStatus} />
            <p className="text-xs text-muted-foreground text-center mt-3">
              Last updated {formatDistanceToNow(new Date(data.lastTrackedAt), { addSuffix: true })} ·{' '}
              <button
                type="button"
                onClick={() => invalidateTrack()}
                className="text-primary font-medium"
              >
                Refresh
              </button>
            </p>
          </div>
        )}

        {events.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mb-4">
            Last updated {formatDistanceToNow(new Date(data.lastTrackedAt), { addSuffix: true })} ·{' '}
            <button
              type="button"
              onClick={() => invalidateTrack()}
              className="text-primary font-medium"
            >
              Refresh
            </button>
          </p>
        )}

        <div className="bg-card rounded-2xl border border-border p-4 mb-4 shadow-sm">
          <h2 className="font-semibold text-sm text-foreground mb-4">Shipment Info</h2>
          <div className="space-y-3">
            {shipmentInfoFields.map((field) => (
              <div key={field.label}>
                <p className="text-[11px] text-muted-foreground">{field.label}</p>
                <p className="text-sm text-foreground mt-0.5">{field.value}</p>
              </div>
            ))}
            {result.forwarding_no?.trim() && (
              <div>
                <p className="text-[11px] text-muted-foreground">Forwarding No.</p>
                <p className="text-sm text-foreground mt-0.5">{result.forwarding_no.trim()}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
          <h2 className="font-semibold text-sm text-foreground mb-4">Parties</h2>
          <div className="space-y-3">
            {partyFields.map((field) => (
              <div key={field.label}>
                <p className="text-[11px] text-muted-foreground">{field.label}</p>
                <p className="text-sm text-foreground mt-0.5">{field.value}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <div className="fixed left-0 right-0 z-40 bg-white border-t border-border p-4 safe-bottom bottom-[var(--nav-stack)]">
        <div className="flex justify-end gap-2 max-w-md mx-auto">
          <a
            href="https://api.whatsapp.com/send?phone=917045999553"
            target="_blank"
            rel="noopener noreferrer"
            className="w-11 h-11 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center hover:bg-green-100 transition-colors"
            data-testid="button-whatsapp"
          >
            <img src={whatsAppLogo} alt="WhatsApp" className="w-5 h-5 object-contain" />
          </a>
          <a
            href="tel:+912266400000"
            className="w-11 h-11 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center hover:bg-primary/20 transition-colors"
            data-testid="button-call"
          >
            <Phone className="w-5 h-5 text-primary" />
          </a>
        </div>
      </div>
      <button
        type="button"
        className="fixed right-4 bottom-[calc(var(--nav-stack)+5.5rem)] z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
        onClick={() => void handleDownloadLabel()}
        data-testid="button-download-label"
      >
        <Download className="w-4 h-4" />
        Label
      </button>
      <BottomNav />
    </div>
  );
}
