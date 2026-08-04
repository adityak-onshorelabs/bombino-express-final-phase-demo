import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ArrowLeft, Loader2, Phone, Navigation, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AgentShell } from '@/components/agent/AgentShell';
import { PickupCard } from '@/components/agent/PickupCard';
import { ActionButtons } from '@/components/agent/ActionButtons';
import { CollectPaymentSheet } from '@/components/agent/CollectPaymentSheet';
import { useAvailablePickups, useMyPickups, useOrderAction } from '@/hooks/useAgentPickups';

/**
 * A5 screen 3 — one job, and the buttons to work through it.
 *
 * Reads from the two cached lists rather than a per-order endpoint: both are
 * already scoped by the server, and this avoids a second round trip on a phone
 * that may be on bad network.
 *
 * Both lists, not just `mine`: the dashboard links unclaimed jobs straight
 * here, so a job the agent has not taken yet must resolve too — otherwise the
 * screen decides the job has vanished and bounces them to My pickups. The
 * buttons come from the server either way, so an unclaimed job simply offers
 * Accept and then carries on down the same screen once claimed.
 *
 * A consequence worth knowing: when the agent marks `received_at_hub` the
 * server drops the job from `mine`, and it is in neither list. That is the
 * handoff working, not an error — we redirect back.
 */
export default function PickupDetail() {
  const [, params] = useRoute('/agent/pickup/:id');
  const [, setLocation] = useLocation();
  const mine = useMyPickups();
  const available = useAvailablePickups();
  const action = useOrderAction();
  const { toast } = useToast();

  const entry =
    mine.data?.find((p) => p.order.id === params?.id) ??
    available.data?.find((p) => p.order.id === params?.id);
  const order = entry?.order;

  const isLoading = mine.isLoading || available.isLoading;
  // Only fatal when we have nothing to show. One list failing while the other
  // holds the job is not worth an error screen.
  const isError = (mine.isError || available.isError) && !entry;

  // The job left both queues (handed to ops, or cancelled). Go back rather
  // than sitting on a screen with nothing on it.
  //
  // Suppressed while either list is in flight: claiming removes the job from
  // `available` and adds it to `mine`, and if those two refetches land a beat
  // apart there is a moment where neither list has it. Redirecting on that
  // would throw the agent off the job they just accepted.
  const settling = mine.isFetching || available.isFetching;
  const vanished = !isLoading && !settling && !isError && !entry;
  useEffect(() => {
    if (vanished) setLocation('/agent/mine', { replace: true });
  }, [vanished, setLocation]);

  // Where "back" goes depends on where the job actually is, not on where the
  // agent happened to tap in from.
  const isUnclaimed = !!entry && !mine.data?.some((p) => p.order.id === entry.order.id);
  const backHref = isUnclaimed ? '/agent/available' : '/agent/mine';
  const backLabel = isUnclaimed ? 'Available' : 'My pickups';

  const [sheetOpen, setSheetOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ txnId: string | null; amount: number } | null>(null);

  const runAction = (actionName: string, payload?: Record<string, unknown>): void => {
    if (!order) return;
    action.mutate(
      { orderId: order.id, action: actionName, payload },
      {
        onSuccess: (result) => {
          if (result.warning) {
            // The action landed but its history row did not — surfaced rather
            // than swallowed, because ops reads that history.
            console.warn('[PickupDetail]', result.warning);
          }
          if (result.receipt) {
            // Hold the sheet open and flip it to the receipt. A transaction id
            // the customer may ask to see must not disappear on a timer.
            setReceipt(result.receipt);
            return;
          }
          toast({
            title: 'Updated',
            description: `${result.order.order_no} — ${result.order.status.replace(/_/g, ' ')}`,
          });
        },
        onError: (err) => {
          toast({
            title: err.status === 409 ? 'This job has moved on' : 'Could not update',
            description: err.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  // Payment needs an amount and a mode, so it opens the sheet instead of
  // firing. Everything else is a single decisive tap.
  const handleAction = (actionName: string): void => {
    if (actionName === 'collect_payment') {
      setReceipt(null);
      setSheetOpen(true);
      return;
    }
    runAction(actionName);
  };

  return (
    <AgentShell title="Pickup detail" subtitle={order?.order_no ?? ''}>
      <button
        type="button"
        onClick={() => setLocation(backHref)}
        className="flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1 h-11"
        data-testid="button-back-mine"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center text-center py-16 px-4">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
          <p className="text-sm font-semibold text-foreground">Could not load this pickup</p>
        </div>
      )}

      {order && entry && (
        <div className="space-y-4">
          <PickupCard pickup={order} />

          {order.origin_address && (
            <div className="rounded-xl border border-border bg-white p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Collect from
              </p>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {order.origin_address.full_name}
                </p>
                <p className="text-xs text-muted-foreground leading-snug mt-1">
                  {[
                    order.origin_address.address_line_1,
                    order.origin_address.address_line_2,
                    order.origin_address.city,
                    order.origin_address.state,
                    order.origin_address.pincode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>

              <div className="flex gap-2">
                {order.origin_address.phone && (
                  <a
                    href={`tel:${order.origin_address.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border border-border text-sm font-semibold text-foreground active:scale-95 transition-transform"
                    data-testid="button-call-sender"
                  >
                    <Phone className="w-4 h-4" />
                    Call
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [
                      order.origin_address.address_line_1,
                      order.origin_address.city,
                      order.origin_address.pincode,
                    ]
                      .filter(Boolean)
                      .join(', '),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border border-border text-sm font-semibold text-foreground active:scale-95 transition-transform"
                  data-testid="button-navigate"
                >
                  <Navigation className="w-4 h-4" />
                  Directions
                </a>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              Next step
            </p>
            <ActionButtons
              actions={entry.availableActions}
              pendingAction={action.isPending ? action.variables?.action ?? null : null}
              disabled={action.isPending}
              onAction={handleAction}
            />
          </div>

          <CollectPaymentSheet
            open={sheetOpen}
            onOpenChange={(next) => {
              setSheetOpen(next);
              if (!next) setReceipt(null);
            }}
            pickup={order}
            isPending={action.isPending}
            receipt={receipt}
            onConfirm={(payload) => runAction('collect_payment', payload)}
          />
        </div>
      )}
    </AgentShell>
  );
}
