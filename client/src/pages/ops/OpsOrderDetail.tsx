import { useState } from 'react';
import { ArrowLeft, Loader2, LogOut } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { ActionBar } from '@/components/agent/ActionButtons';
import { OpsShell } from '@/components/ops/OpsShell';
import { OpsWeighSheet } from '@/components/ops/OpsWeighSheet';
import { OpsCollectPaymentSheet } from '@/components/ops/OpsCollectPaymentSheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useOpsOrderAction,
  useOpsOrderDetail,
  type OpsActionError,
} from '@/hooks/useOpsOrders';
import { getOrderStatusLabel } from '@/lib/orderStatus';
import { useAppStore } from '@/lib/store';

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="py-2.5 border-b border-border last:border-b-0">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground mt-0.5 break-words">
        {value ?? '—'}
      </p>
    </div>
  );
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function consigneeLines(consignee: unknown): { name: string; city: string; phone: string } {
  if (!consignee || typeof consignee !== 'object' || Array.isArray(consignee)) {
    return { name: '—', city: '—', phone: '—' };
  }
  const c = consignee as Record<string, unknown>;
  const str = (k: string) =>
    typeof c[k] === 'string' && (c[k] as string).trim() !== ''
      ? (c[k] as string).trim()
      : '—';
  return {
    name: str('name') !== '—' ? str('name') : str('full_name'),
    city: str('city') !== '—' ? str('city') : str('consignee_city'),
    phone: str('phone'),
  };
}

/**
 * Ops order detail + event timeline + lifecycle actions (3B).
 * generate_docket filtered until 3C.
 */
export default function OpsOrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [, setLocation] = useLocation();
  const { logout } = useAppStore();
  const { toast } = useToast();
  const { data, isLoading, error, isError } = useOpsOrderDetail(orderId);
  const action = useOpsOrderAction(orderId);

  const [weighOpen, setWeighOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ txnId: string | null; amount: number } | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const forbidden =
    isError &&
    error instanceof Error &&
    error.message.startsWith('403:');

  const handleLogout = async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    logout();
    setLocation('/login');
  };

  const runAction = (actionName: string, payload?: Record<string, unknown>): void => {
    setPendingAction(actionName);
    action.mutate(
      { action: actionName, payload },
      {
        onSuccess: (result) => {
          setPendingAction(null);
          if (result.receipt) {
            setReceipt(result.receipt);
            return;
          }
          setWeighOpen(false);
          setCollectOpen(false);
          toast({
            title: 'Updated',
            description: `${result.order.order_no} — ${getOrderStatusLabel(result.order.status)}`,
          });
        },
        onError: (err: OpsActionError) => {
          setPendingAction(null);
          const isRetryReprice = err.code === 'RETRY_REPRICE';
          toast({
            title: isRetryReprice
              ? 'Could not reprice'
              : err.status === 409
                ? 'Order moved on'
                : 'Could not update',
            description: isRetryReprice
              ? err.message ||
                'Reprice failed. The order was not changed — fix rates inputs or try again.'
              : err.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleAction = (actionName: string): void => {
    if (actionName === 'weigh') {
      setWeighOpen(true);
      return;
    }
    if (actionName === 'collect_payment') {
      setReceipt(null);
      setCollectOpen(true);
      return;
    }
    if (actionName === 'mark_received_dropoff' || actionName === 'settle') {
      const label =
        actionName === 'settle' ? 'Settle this order?' : 'Mark this parcel received at hub?';
      if (!window.confirm(label)) return;
    }
    runAction(actionName);
  };

  if (forbidden) {
    return (
      <OpsShell title="Order" subtitle="Access required">
        <div className="rounded-2xl border border-border bg-white p-6 text-center">
          <p className="text-base font-semibold">Ops access required</p>
          <Button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-5 bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] font-semibold"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </OpsShell>
    );
  }

  if (isLoading) {
    return (
      <OpsShell title="Order" subtitle="Loading">
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </OpsShell>
    );
  }

  if (isError || !data) {
    const notFound =
      error instanceof Error && error.message.startsWith('404:');
    return (
      <OpsShell title="Order" subtitle={notFound ? 'Not found' : 'Error'}>
        <Link
          href="/ops"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#F2A123] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to board
        </Link>
        <p className="text-sm text-muted-foreground">
          {notFound ? 'That order could not be found.' : 'Could not load this order.'}
        </p>
      </OpsShell>
    );
  }

  const { order, events, availableActions } = data;
  const consignee = consigneeLines(order.consignee);
  const visibleActions = availableActions.filter((a) => a.action !== 'generate_docket');
  const dueAmount = order.final_amount ?? order.quoted_amount ?? 0;

  return (
    <OpsShell title={order.order_no} subtitle={getOrderStatusLabel(order.status)}>
      <Link
        href="/ops"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#F2A123] mb-4"
        data-testid="link-ops-back-board"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to board
      </Link>

      <section
        className="rounded-2xl border border-border bg-white px-4 mb-6"
        data-testid="ops-order-facts"
      >
        <Fact label="Status" value={getOrderStatusLabel(order.status)} />
        <Fact
          label="Mode"
          value={order.pickup_request === 2 ? 'Drop-off' : 'Pickup'}
        />
        <Fact
          label="Pickup window"
          value={
            order.pickup_date || order.pickup_slot
              ? [order.pickup_date, order.pickup_slot].filter(Boolean).join(' · ')
              : '—'
          }
        />
        <Fact label="Booked weight" value={order.booked_weight != null ? `${order.booked_weight} kg` : '—'} />
        <Fact label="Actual weight" value={order.actual_weight != null ? `${order.actual_weight} kg` : '—'} />
        <Fact label="Quoted amount" value={formatMoney(order.quoted_amount)} />
        <Fact label="Final amount" value={formatMoney(order.final_amount)} />
        <Fact
          label="Payment"
          value={
            order.is_cod
              ? 'COD'
              : `${order.payment_method.replace(/_/g, ' ')} · ${order.payment_status}`
          }
        />
        <Fact label="Consignee" value={consignee.name} />
        <Fact label="City" value={consignee.city} />
        <Fact label="Phone" value={consignee.phone} />
        <Fact label="Agent id" value={order.agent_id ?? '—'} />
        <Fact label="AWB" value={order.awb_no ?? '—'} />
        <Fact label="Created" value={formatWhen(order.created_at)} />
      </section>

      <section className="mb-6" data-testid="ops-order-actions">
        <h2 className="text-[11px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-3">
          Actions
        </h2>
        <ActionBar
          actions={visibleActions}
          onAction={handleAction}
          pendingAction={pendingAction}
          disabled={action.isPending}
        />
      </section>

      <section data-testid="ops-order-timeline">
        <h2 className="text-[11px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-3">
          Timeline
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ol className="rounded-2xl border border-border bg-white divide-y divide-border">
            {events.map((ev) => (
              <li key={ev.id} className="px-4 py-3">
                <p className="text-sm font-extrabold text-foreground">
                  {getOrderStatusLabel(ev.status)}
                </p>
                {ev.note && (
                  <p className="text-sm text-muted-foreground mt-0.5">{ev.note}</p>
                )}
                <p className="text-[11px] font-medium text-muted-foreground mt-1 tabular-nums">
                  {formatWhen(ev.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <OpsWeighSheet
        open={weighOpen}
        onOpenChange={setWeighOpen}
        bookedWeight={order.booked_weight}
        isPending={action.isPending && pendingAction === 'weigh'}
        onConfirm={(payload) => runAction('weigh', payload)}
      />

      <OpsCollectPaymentSheet
        open={collectOpen}
        onOpenChange={(open) => {
          setCollectOpen(open);
          if (!open) setReceipt(null);
        }}
        orderNo={order.order_no}
        dueAmount={dueAmount}
        isPending={action.isPending && pendingAction === 'collect_payment'}
        receipt={receipt}
        onConfirm={(payload) => runAction('collect_payment', payload)}
      />
    </OpsShell>
  );
}
