import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { ArrowLeft, Check, Package, User, MapPin, Send, ArrowRight, Loader2, AlertTriangle, FileText, Copy } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { BottomNav } from '@/components/BottomNav';
import { CorridorRouteInfo } from '@/components/CorridorRouteInfo';
import { KycUpload, type KycUploadResult } from '@/components/KycUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/lib/store';
import { Shipment, TrackingEvent, lbToKg, inToCm } from '@/lib/mockData';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface FreeFormLineItem {
  total: string;
  no_of_packages: string;
  box_no: string;
  rate: string;
  hscode: string;
  description: string;
  unit_of_measurement: string;
  unit_weight: string;
  igst_amount: string;
}

interface CreateShipmentPayload {
  product_code: string;
  destination_code: string;
  booking_date: string;
  booking_time: string;
  pcs: string;
  shipment_value: string;
  shipment_value_currency: string;
  actual_weight: string;
  shipment_invoice_no: string;
  shipment_invoice_date: string;
  shipment_content: string;
  new_docket_free_form_invoice?: string;
  free_form_invoice_type_id?: string;
  free_form_currency?: string;
  terms_of_trade?: string;
  entry_type?: number;
  api_service_code: string;
  shipper_name: string;
  shipper_company_name: string;
  shipper_contact_no: string;
  shipper_email: string;
  shipper_address_line_1: string;
  shipper_city: string;
  shipper_state: string;
  shipper_country: string;
  shipper_zip_code: string;
  shipper_gstin_type?: string;
  shipper_gstin_no?: string;
  consignee_name: string;
  consignee_company_name: string;
  consignee_contact_no: string;
  consignee_email: string;
  consignee_address_line_1: string;
  consignee_city: string;
  consignee_state: string;
  consignee_country: string;
  consignee_zip_code: string;
  docket_items: { actual_weight: string; length: string; width: string; height: string; number_of_boxes: string }[];
  free_form_line_items?: FreeFormLineItem[];
  kyc_details?: Array<{
    document_type: string;
    document_no: string;
    document_sub_type: string;
    document_name: string;
    file_path: string;
  }>;
}

interface CreateShipmentResponse {
  success: boolean;
  errors: string[];
  data: {
    docket_id: number;
    awb_no: string;
  };
}

const steps = [
  { id: 1, title: 'Sender', icon: User },
  { id: 2, title: 'Receiver', icon: MapPin },
  { id: 3, title: 'Package', icon: Package },
  { id: 4, title: 'Invoice', icon: FileText },
];

const DEFAULT_API_SERVICE_CODE = 'BOMBINO PREMIUM DDP SERVICE';

function apiServiceCodeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fromQuery = params.get('api_service_code');
  return fromQuery && fromQuery.trim() ? fromQuery : DEFAULT_API_SERVICE_CODE;
}

export default function CreateShipment() {
  const search = useSearch();
  const [apiServiceCode] = useState(() => apiServiceCodeFromSearch(search));
  const [, setLocation] = useLocation();
  const { isLoggedIn, user, addShipment, addNotification } = useAppStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [newAWB, setNewAWB] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [senderName, setSenderName] = useState(isLoggedIn ? user?.fullName ?? '' : '');
  const [senderEmail, setSenderEmail] = useState(isLoggedIn ? user?.email ?? '' : '');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderCompany, setSenderCompany] = useState('');
  const [senderCity, setSenderCity] = useState('');
  const [senderState, setSenderState] = useState('');
  const [senderZip, setSenderZip] = useState('');
  const [senderAddress, setSenderAddress] = useState('');

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverEmail, setReceiverEmail] = useState('');
  const [receiverCompany, setReceiverCompany] = useState('');
  const [receiverCity, setReceiverCity] = useState('');
  const [receiverState, setReceiverState] = useState('');
  const [receiverZip, setReceiverZip] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');

  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [weight, setWeight] = useState('2');
  const [pieces, setPieces] = useState('1');
  const [dimUnit, setDimUnit] = useState<'in' | 'cm'>('in');
  const [dimL, setDimL] = useState('');
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [shipmentValue, setShipmentValue] = useState('');
  const [shipmentContent, setShipmentContent] = useState('');

  const [invoiceQty, setInvoiceQty] = useState('1');
  const [invoiceUnitWeight, setInvoiceUnitWeight] = useState('');
  const [invoiceUnitRate, setInvoiceUnitRate] = useState('');
  const [productType, setProductType] = useState<'COMMERCIAL' | 'CSB V' | 'DOX' | 'SPX'>('SPX');

  const [kycResult, setKycResult] = useState<KycUploadResult | null>(null);

  const [stepError, setStepError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const fieldBorderClass = (key: string) =>
    cn(
      'h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl',
      fieldErrors[key] && 'border-2 border-primary'
    );

  const fieldBorderClassNoMt = (key: string) =>
    cn(
      'h-11 text-sm bg-muted/30 border-border rounded-xl',
      fieldErrors[key] && 'border-2 border-primary'
    );

  const { toast } = useToast();

  useEffect(() => {
    if (!newAWB) return;
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { x: 0.5, y: 0.5 },
      startVelocity: 40,
      colors: ['#D32F2F', '#ffffff'],
    });
  }, [newAWB]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateShipmentPayload) =>
      apiRequest('POST', '/api/shipments', payload).then((r) => r.json() as Promise<CreateShipmentResponse>),
    onSuccess: (data) => {
      if (!data.success) {
        setSubmitError(data.errors?.join(', ') || 'Shipment creation failed');
        return;
      }
      const awb = data.data.awb_no;
      const now = new Date();
      const w = parseFloat(weight) || 1;
      const weightLb = weightUnit === 'lb' ? w : w / 0.453592;
      const weightKg = weightUnit === 'kg' ? w : lbToKg(w);

      let dimLIn: number | undefined;
      let dimWIn: number | undefined;
      let dimHIn: number | undefined;
      let dimLCm: number | undefined;
      let dimWCm: number | undefined;
      let dimHCm: number | undefined;

      if (dimL || dimW || dimH) {
        if (dimUnit === 'in') {
          dimLIn = parseFloat(dimL) || undefined;
          dimWIn = parseFloat(dimW) || undefined;
          dimHIn = parseFloat(dimH) || undefined;
          dimLCm = dimLIn ? inToCm(dimLIn) : undefined;
          dimWCm = dimWIn ? inToCm(dimWIn) : undefined;
          dimHCm = dimHIn ? inToCm(dimHIn) : undefined;
        } else {
          dimLCm = parseFloat(dimL) || undefined;
          dimWCm = parseFloat(dimW) || undefined;
          dimHCm = parseFloat(dimH) || undefined;
          dimLIn = dimLCm ? dimLCm / 2.54 : undefined;
          dimWIn = dimWCm ? dimWCm / 2.54 : undefined;
          dimHIn = dimHCm ? dimHCm / 2.54 : undefined;
        }
      }

      const eta = new Date();
      eta.setDate(eta.getDate() + 5); // Bombino Premium DDP is express-grade

      const trackingEvents: TrackingEvent[] = [{
        id: `event-${Math.random().toString(36).slice(2)}`,
        status: 'Pickup Scheduled',
        note: 'Shipment pickup has been scheduled',
        location: `${senderCity}, ${senderState}, India`,
        timestamp: now,
      }];

      const shipment: Shipment = {
        id: Math.random().toString(36).slice(2),
        awb,
        userId: user?.id ?? '',
        originCountry: 'India',
        originCity: senderCity,
        originState: senderState,
        originZip: senderZip,
        destCountry: 'USA',
        destCity: receiverCity,
        destState: receiverState,
        destPincode: receiverZip,
        weightLb: parseFloat(weightLb.toFixed(1)),
        weightKg: parseFloat(weightKg.toFixed(2)),
        pieces: parseInt(pieces) || 1,
        dimLIn, dimWIn, dimHIn, dimLCm, dimWCm, dimHCm,
        productType: 'Package' as const,
        serviceType: 'Express' as const,
        status: 'Pickup Scheduled',
        priceEstimate: 0,
        eta,
        lastUpdateAt: now,
        createdAt: now,
        currency: 'USD',
        trackingEvents,
      };

      addShipment(shipment);
      addNotification({
        id: `notif-${Math.random().toString(36).slice(2)}`,
        userId: user?.id ?? '',
        title: 'Shipment Created',
        body: `Your shipment ${awb} has been created.`,
        severity: 'info',
        createdAt: now,
      });

      setNewAWB(awb);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message.replace(/^\d+:\s*/, '') : 'Shipment creation failed';
      setSubmitError(msg);
    },
  });

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background pb-20" data-testid="screen-create-login-required">
        <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
          <div className="flex items-center h-14 px-4 max-w-md mx-auto">
            <button
              onClick={() => setLocation('/home')}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="ml-2 font-semibold text-sm">Ship</h1>
          </div>
        </header>

        <main className="px-4 py-12 max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Please login to continue</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in to create and manage your shipments
          </p>
          <Button
            onClick={() => setLocation('/login?redirect=/create')}
            className="bg-primary hover:bg-primary/90 h-12 px-8 rounded-xl shadow-md"
            data-testid="button-login-to-create"
          >
            Login
          </Button>
        </main>

        <BottomNav />
      </div>
    );
  }

  if (newAWB) {
    const bookingDateLabel = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const corridorLabel = `${senderCity}, ${senderState} → ${receiverCity}, ${receiverState}`;

    const copyAwb = (): void => {
      void navigator.clipboard.writeText(newAWB).then(() => {
        toast({ title: 'Copied', description: 'AWB copied to clipboard' });
      });
    };

    return (
      <div className="min-h-screen bg-background pb-20" data-testid="screen-create-success">
        <main className="px-4 py-12 max-w-md mx-auto text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5 animate-scale-in">
            <Check className="w-10 h-10 text-[#D32F2F]" strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Shipment Booked!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your shipment has been successfully created.
          </p>

          <div className="bg-card rounded-xl border border-border p-4 mb-6 text-left shadow-sm w-full">
            <button
              type="button"
              onClick={copyAwb}
              className="w-full text-left rounded-lg p-2 -m-2 hover:bg-muted/50 transition-colors active:scale-[0.99]"
              data-testid="button-copy-awb"
            >
              <p className="text-xs text-muted-foreground mb-1">AWB Number · tap to copy</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold text-foreground break-all">{newAWB}</p>
                <Copy className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </button>

            <div className="mt-4 pt-4 border-t border-border space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Service</span>
                <span className="font-medium text-foreground text-right text-xs break-words">{apiServiceCode}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Booking date</span>
                <span className="font-medium text-foreground text-right">{bookingDateLabel}</span>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">From → To</p>
                <p className="font-medium text-foreground text-sm leading-snug">{corridorLabel}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => setLocation(`/shipment/${encodeURIComponent(newAWB)}`)}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-sm rounded-xl shadow-md"
              data-testid="button-track-shipment"
            >
              Track Shipment
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/home')}
              className="w-full h-12 text-sm rounded-xl border-border"
              data-testid="button-go-home"
            >
              Go Home
            </Button>
          </div>
        </main>

        <BottomNav />
      </div>
    );
  }

  const handleNext = () => {
    setStepError('');
    setFieldErrors({});
    if (currentStep === 1) {
      const e: Record<string, boolean> = {};
      if (!senderName.trim()) e.senderName = true;
      if (!/^\d{10}$/.test(senderPhone.trim())) e.senderPhone = true;
      if (!senderAddress.trim()) e.senderAddress = true;
      if (!senderCity.trim()) e.senderCity = true;
      if (!senderState.trim()) e.senderState = true;
      if (!senderZip.trim()) e.senderZip = true;
      if (!kycResult) e.kycMissing = true;
      if (Object.keys(e).length) {
        setFieldErrors(e);
        return;
      }
    }
    if (currentStep === 2) {
      const e: Record<string, boolean> = {};
      if (!receiverName.trim()) e.receiverName = true;
      if (!/^\d{10}$/.test(receiverPhone.trim())) e.receiverPhone = true;
      if (!receiverAddress.trim()) e.receiverAddress = true;
      if (!receiverCity.trim()) e.receiverCity = true;
      if (!receiverState.trim()) e.receiverState = true;
      if (!receiverZip.trim()) e.receiverZip = true;
      if (Object.keys(e).length) {
        setFieldErrors(e);
        return;
      }
    }
    if (currentStep === 3) {
      const e: Record<string, boolean> = {};
      if (!weight || parseFloat(weight) <= 0) e.weight = true;
      if (!shipmentValue || parseFloat(shipmentValue) <= 0) e.shipmentValue = true;
      if (!shipmentContent.trim()) e.shipmentContent = true;
      if (Object.keys(e).length) {
        setFieldErrors(e);
        return;
      }
    }
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setFieldErrors({});
    setStepError('');
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      setLocation('/home');
    }
  };

  const getWeightLb = (): number => {
    const w = parseFloat(weight) || 1;
    return weightUnit === 'lb' ? w : w / 0.453592;
  };

  const handleSubmit = () => {
    setSubmitError('');
    setFieldErrors({});
    const invE: Record<string, boolean> = {};
    const qtyNum = parseInt(invoiceQty, 10);
    if (!invoiceQty.trim() || Number.isNaN(qtyNum) || qtyNum < 1) invE.invoiceQty = true;
    const uw = parseFloat(invoiceUnitWeight || '');
    if (!invoiceUnitWeight.trim() || Number.isNaN(uw) || uw <= 0) invE.invoiceUnitWeight = true;
    const ur = parseFloat(invoiceUnitRate || '');
    if (!invoiceUnitRate.trim() || Number.isNaN(ur) || ur <= 0) invE.invoiceUnitRate = true;
    if (Object.keys(invE).length) {
      setFieldErrors(invE);
      return;
    }
    const weightLb = getWeightLb();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 8); // HH:MM:SS

    const lengthVal = dimL ? (dimUnit === 'cm' ? String(parseFloat(dimL) / 2.54) : dimL) : '0';
    const widthVal = dimW ? (dimUnit === 'cm' ? String(parseFloat(dimW) / 2.54) : dimW) : '0';
    const heightVal = dimH ? (dimUnit === 'cm' ? String(parseFloat(dimH) / 2.54) : dimH) : '0';

    const qty = parseInt(invoiceQty) || 1;
    const rate = parseFloat(invoiceUnitRate) || 0;
    const total = (qty * rate).toFixed(2);

    const payload: CreateShipmentPayload = {
      product_code: productType,
      destination_code: 'US',
      booking_date: todayStr,
      booking_time: timeStr,
      pcs: String(parseInt(pieces) || 1),
      shipment_value: shipmentValue || '0',
      shipment_value_currency: 'USD',
      actual_weight: String(weightLb.toFixed(2)),
      // TODO: shipment_invoice_no hardcoded — update when invoice numbering is implemented
      shipment_invoice_no: 'TESTINV01',
      shipment_invoice_date: todayStr,
      shipment_content: shipmentContent || 'GIFTS',
      new_docket_free_form_invoice: '1',
      free_form_invoice_type_id: '1',
      free_form_currency: 'USD',
      terms_of_trade: 'FOB',
      entry_type: 2,
      api_service_code: apiServiceCode,
      shipper_name: senderName,
      shipper_company_name: senderCompany || senderName,
      shipper_contact_no: senderPhone,
      shipper_email: senderEmail,
      shipper_address_line_1: senderAddress,
      shipper_city: senderCity,
      shipper_state: senderState,
      shipper_country: 'IN',
      shipper_zip_code: senderZip,
      shipper_gstin_type: 'AADHAAR NUMBER',
      shipper_gstin_no: kycResult!.document_no,
      kyc_details: [{
        document_type:     kycResult!.document_type,
        document_no:       kycResult!.document_no,
        document_sub_type: 'doc_1',
        document_name:     '',
        file_path:         kycResult!.file_path,
      }],
      consignee_name: receiverName,
      consignee_company_name: receiverCompany || receiverName,
      consignee_contact_no: receiverPhone,
      consignee_email: receiverEmail || senderEmail,
      consignee_address_line_1: receiverAddress,
      consignee_city: receiverCity,
      consignee_state: receiverState,
      consignee_country: 'US',
      consignee_zip_code: receiverZip,
      docket_items: [{
        actual_weight: String(weightLb.toFixed(2)),
        length: lengthVal,
        width: widthVal,
        height: heightVal,
        number_of_boxes: String(parseInt(pieces) || 1),
      }],
      free_form_line_items: [{
        total,
        no_of_packages: String(qty),
        box_no: '1',
        rate: String(rate),
        // TODO: hscode hardcoded — update when HS code lookup is implemented
        hscode: '456789',
        // TODO: description hardcoded — update when item descriptions are configurable
        description: 'GIFTS',
        unit_of_measurement: 'PCS',
        unit_weight: invoiceUnitWeight || '0.00',
        igst_amount: '0.00',
      }],
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="screen-create">
      <header className="sticky top-0 z-50 bg-white border-b-2 border-primary/20 safe-top">
        <div className="flex items-center h-14 px-4 max-w-md mx-auto">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back-create"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="ml-2 font-semibold text-sm">Create Shipment</h1>
        </div>
      </header>

      <div className="px-4 py-3 bg-white border-b border-border">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                      isActive && 'bg-primary text-white',
                      isCompleted && 'bg-green-500 text-white',
                      !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={cn(
                    'text-[10px] mt-1',
                    isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
                  )}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn(
                    'w-10 h-0.5 mx-1',
                    currentStep > step.id ? 'bg-green-500' : 'bg-muted'
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <main className="px-4 py-5 max-w-md mx-auto">
        {currentStep === 1 && (
          <div className="space-y-4 animate-fade-in">
            <CorridorRouteInfo />

            <div className="bg-card rounded-xl border border-border p-4 space-y-3 shadow-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Full Name <span className="text-red-400">*</span></Label>
                <Input
                  value={senderName}
                  onChange={(e) => {
                    setSenderName(e.target.value);
                    clearFieldError('senderName');
                  }}
                  placeholder="John Doe"
                  className={fieldBorderClass('senderName')}
                  data-testid="input-sender-name"
                />
                {fieldErrors.senderName && (
                  <p className="text-xs text-red-600 mt-1">This field is required</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Company Name <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input
                  value={senderCompany}
                  onChange={(e) => setSenderCompany(e.target.value)}
                  placeholder="Company name"
                  className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                  data-testid="input-sender-company"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                    data-testid="input-sender-email"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={senderPhone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setSenderPhone(digits);
                      clearFieldError('senderPhone');
                    }}
                    placeholder="+91"
                    className={fieldBorderClass('senderPhone')}
                    data-testid="input-sender-phone"
                  />
                  {fieldErrors.senderPhone && (
                    <p className="text-xs text-red-600 mt-1">Must be exactly 10 digits</p>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Address</Label>
                <Input
                  value={senderAddress}
                  onChange={(e) => {
                    setSenderAddress(e.target.value);
                    clearFieldError('senderAddress');
                  }}
                  placeholder="Street address"
                  className={fieldBorderClass('senderAddress')}
                  data-testid="input-sender-address"
                />
                {fieldErrors.senderAddress && (
                  <p className="text-xs text-red-600 mt-1">This field is required</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input
                    value={senderCity}
                    onChange={(e) => {
                      setSenderCity(e.target.value);
                      clearFieldError('senderCity');
                    }}
                    className={fieldBorderClass('senderCity')}
                    data-testid="input-sender-city"
                  />
                  {fieldErrors.senderCity && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <Input
                    value={senderState}
                    onChange={(e) => {
                      setSenderState(e.target.value);
                      clearFieldError('senderState');
                    }}
                    className={fieldBorderClass('senderState')}
                    data-testid="input-sender-state"
                  />
                  {fieldErrors.senderState && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pincode</Label>
                  <Input
                    value={senderZip}
                    onChange={(e) => {
                      setSenderZip(e.target.value);
                      clearFieldError('senderZip');
                    }}
                    maxLength={6}
                    className={fieldBorderClass('senderZip')}
                    data-testid="input-sender-zip"
                  />
                  {fieldErrors.senderZip && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
              </div>
            </div>

            <KycUpload
              onValidChange={setKycResult}
              fieldErrors={{
                document_no: !!fieldErrors.kycMissing,
                file: !!fieldErrors.kycMissing,
              }}
            />

            {stepError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{stepError}</p>
              </div>
            )}

            <Button
              onClick={handleNext}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-sm font-semibold rounded-xl shadow-md"
              data-testid="button-next-step"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4 animate-fade-in">
            <CorridorRouteInfo />

            <div className="bg-card rounded-xl border border-border p-4 space-y-3 shadow-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Receiver Name</Label>
                <Input
                  value={receiverName}
                  onChange={(e) => {
                    setReceiverName(e.target.value);
                    clearFieldError('receiverName');
                  }}
                  className={fieldBorderClass('receiverName')}
                  data-testid="input-receiver-name"
                />
                {fieldErrors.receiverName && (
                  <p className="text-xs text-red-600 mt-1">This field is required</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Company Name <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input
                  value={receiverCompany}
                  onChange={(e) => setReceiverCompany(e.target.value)}
                  placeholder="Company name"
                  className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                  data-testid="input-receiver-company"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={receiverPhone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setReceiverPhone(digits);
                      clearFieldError('receiverPhone');
                    }}
                    placeholder="+1"
                    className={fieldBorderClass('receiverPhone')}
                    data-testid="input-receiver-phone"
                  />
                  {fieldErrors.receiverPhone && (
                    <p className="text-xs text-red-600 mt-1">Must be exactly 10 digits</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={receiverEmail}
                    onChange={(e) => setReceiverEmail(e.target.value)}
                    className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                    data-testid="input-receiver-email"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Address</Label>
                <Input
                  value={receiverAddress}
                  onChange={(e) => {
                    setReceiverAddress(e.target.value);
                    clearFieldError('receiverAddress');
                  }}
                  className={fieldBorderClass('receiverAddress')}
                  data-testid="input-receiver-address"
                />
                {fieldErrors.receiverAddress && (
                  <p className="text-xs text-red-600 mt-1">This field is required</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input
                    value={receiverCity}
                    onChange={(e) => {
                      setReceiverCity(e.target.value);
                      clearFieldError('receiverCity');
                    }}
                    className={fieldBorderClass('receiverCity')}
                    data-testid="input-receiver-city"
                  />
                  {fieldErrors.receiverCity && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <Input
                    value={receiverState}
                    onChange={(e) => {
                      setReceiverState(e.target.value);
                      clearFieldError('receiverState');
                    }}
                    className={fieldBorderClass('receiverState')}
                    data-testid="input-receiver-state"
                  />
                  {fieldErrors.receiverState && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ZIP Code</Label>
                  <Input
                    value={receiverZip}
                    onChange={(e) => {
                      setReceiverZip(e.target.value);
                      clearFieldError('receiverZip');
                    }}
                    maxLength={5}
                    className={fieldBorderClass('receiverZip')}
                    data-testid="input-receiver-pincode"
                  />
                  {fieldErrors.receiverZip && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
              </div>
            </div>

            {stepError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{stepError}</p>
              </div>
            )}

            <Button
              onClick={handleNext}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-sm font-semibold rounded-xl shadow-md"
              data-testid="button-next-step"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4 animate-fade-in">
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
                  <Label className="text-xs text-muted-foreground">Weight ({weightUnit})</Label>
                  <Input
                    type="number"
                    value={weight}
                    onChange={(e) => {
                      setWeight(e.target.value);
                      clearFieldError('weight');
                    }}
                    className={fieldBorderClass('weight')}
                    step="0.1"
                    min="0.1"
                    data-testid="input-package-weight"
                  />
                  {fieldErrors.weight && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pieces</Label>
                  <Input
                    type="number"
                    value={pieces}
                    onChange={(e) => setPieces(e.target.value)}
                    className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
                    min="1"
                    data-testid="input-package-pieces"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                ≈ {weightUnit === 'lb' ? `${(parseFloat(weight) * 0.453592).toFixed(2)} kg` : `${(parseFloat(weight) / 0.453592).toFixed(1)} lb`}
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Dimensions <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="flex bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setDimUnit('in')}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                      dimUnit === 'in' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'
                    )}
                  >
                    in
                  </button>
                  <button
                    onClick={() => setDimUnit('cm')}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                      dimUnit === 'cm' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'
                    )}
                  >
                    cm
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">L</Label>
                  <Input type="number" value={dimL} onChange={(e) => setDimL(e.target.value)} placeholder="12" className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">W</Label>
                  <Input type="number" value={dimW} onChange={(e) => setDimW(e.target.value)} placeholder="10" className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">H</Label>
                  <Input type="number" value={dimH} onChange={(e) => setDimH(e.target.value)} placeholder="8" className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl" />
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <Label className="text-sm font-semibold mb-3 block">Shipment Value</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Declared Value</Label>
                  <Input
                    type="number"
                    value={shipmentValue}
                    onChange={(e) => {
                      setShipmentValue(e.target.value);
                      clearFieldError('shipmentValue');
                    }}
                    placeholder="100"
                    className={fieldBorderClass('shipmentValue')}
                    min="0"
                    step="0.01"
                    data-testid="input-shipment-value"
                  />
                  {fieldErrors.shipmentValue && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Currency</Label>
                  <div className="h-11 mt-1 flex items-center justify-center bg-muted/50 border border-border rounded-xl text-sm font-medium text-muted-foreground">
                    USD
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Customs declared value for international shipping</p>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <Label className="text-sm font-semibold mb-3 block">Shipment Content</Label>
              <Input
                value={shipmentContent}
                onChange={(e) => {
                  setShipmentContent(e.target.value);
                  clearFieldError('shipmentContent');
                }}
                placeholder="e.g. BOOKS, CLOTHES, ELECTRONICS"
                className={fieldBorderClassNoMt('shipmentContent')}
                data-testid="input-shipment-content"
              />
              {fieldErrors.shipmentContent && (
                <p className="text-xs text-red-600 mt-1">This field is required</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1.5">Describe what you're shipping for customs</p>
            </div>

            {stepError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{stepError}</p>
              </div>
            )}

            <Button
              onClick={handleNext}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-sm font-semibold rounded-xl shadow-md"
              data-testid="button-next-step"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
              Required for Indian customs clearance. These details appear on the commercial invoice.
            </div>

            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <Label className="text-sm font-semibold mb-3 block">Service Details</Label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Product Type</span>
                  <Select value={productType} onValueChange={(v) => setProductType(v as typeof productType)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COMMERCIAL">COMMERCIAL</SelectItem>
                      <SelectItem value="CSB V">CSB V</SelectItem>
                      <SelectItem value="DOX">DOX</SelectItem>
                      <SelectItem value="SPX">SPX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between text-sm gap-2">
                  <span className="text-muted-foreground shrink-0">Service</span>
                  <span className="font-medium text-foreground text-right text-xs break-words">
                    {apiServiceCode}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">HS Code</span>
                  {/* TODO: hscode hardcoded — update when HS code lookup is implemented */}
                  <span className="font-medium text-foreground">456789</span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 space-y-3 shadow-sm">
              <Label className="text-sm font-semibold">Invoice Item</Label>
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                {/* TODO: description hardcoded — update when item descriptions are configurable */}
                <div className="h-11 mt-1 px-3 flex items-center bg-muted/50 border border-border rounded-xl text-sm text-muted-foreground">
                  GIFTS
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Quantity</Label>
                  <Input
                    type="number"
                    value={invoiceQty}
                    onChange={(e) => {
                      setInvoiceQty(e.target.value);
                      clearFieldError('invoiceQty');
                    }}
                    min="1"
                    className={fieldBorderClass('invoiceQty')}
                    data-testid="input-invoice-qty"
                  />
                  {fieldErrors.invoiceQty && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Unit Weight (kg)</Label>
                  <Input
                    type="number"
                    value={invoiceUnitWeight}
                    onChange={(e) => {
                      setInvoiceUnitWeight(e.target.value);
                      clearFieldError('invoiceUnitWeight');
                    }}
                    placeholder="0.00"
                    step="0.01"
                    className={fieldBorderClass('invoiceUnitWeight')}
                    data-testid="input-invoice-unit-weight"
                  />
                  {fieldErrors.invoiceUnitWeight && (
                    <p className="text-xs text-red-600 mt-1">This field is required</p>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Unit Rate (USD)</Label>
                <Input
                  type="number"
                  value={invoiceUnitRate}
                  onChange={(e) => {
                    setInvoiceUnitRate(e.target.value);
                    clearFieldError('invoiceUnitRate');
                  }}
                  placeholder="100"
                  className={fieldBorderClass('invoiceUnitRate')}
                  data-testid="input-invoice-unit-rate"
                />
                {fieldErrors.invoiceUnitRate && (
                  <p className="text-xs text-red-600 mt-1">This field is required</p>
                )}
              </div>
              {invoiceQty && invoiceUnitRate && (
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">
                    ${(parseFloat(invoiceQty || '0') * parseFloat(invoiceUnitRate || '0')).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {submitError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{submitError}</p>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-sm font-semibold rounded-xl shadow-md disabled:opacity-70"
              data-testid="button-submit-shipment"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Create Shipment'
              )}
            </Button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
