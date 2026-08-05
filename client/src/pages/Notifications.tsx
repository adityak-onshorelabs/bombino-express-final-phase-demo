import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Bell, AlertTriangle, Info, LogIn } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ApiNotification {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  data: { awb?: string } | null;
  is_read: boolean | null;
  read_at: string | null;
  shipment_id: string | null;
  created_at: string;
}

function parseNotifData(raw: unknown): { awb?: string } {
  if (!raw || typeof raw !== 'object') return {};
  const d = raw as Record<string, unknown>;
  const awb = d.awb;
  return typeof awb === 'string' ? { awb } : {};
}

export default function Notifications() {
  const [, setLocation] = useLocation();
  const { isLoggedIn } = useAppStore();

  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!isLoggedIn) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as ApiNotification[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleNotificationClick = async (n: ApiNotification) => {
    const data = parseNotifData(n.data);
    try {
      const res = await fetch(`/api/notifications/${n.id}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id ? { ...x, is_read: true, read_at: new Date().toISOString() } : x
          )
        );
        if (data.awb) {
          setLocation(`/shipment/${encodeURIComponent(data.awb)}`);
        }
      }
    } catch {
      /* ignore */
    }
  };

  const formatTime = (iso: string) => {
    const d = parseISO(iso);
    if (!isValid(d)) return '';
    return format(d, 'MMM d, h:mm a');
  };

  return (
    <div className="min-h-[100dvh] bg-background" data-testid="screen-notifications">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-[0_1px_3px_oklch(17%_0.048_248_/_0.06)] safe-top md:hidden">
        <div className="flex items-center h-14 px-4 max-w-md mx-auto">
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
            data-testid="button-back-notifications"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="ml-2 font-semibold text-sm">Notifications</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-4 md:px-8 py-6">
        {!isLoggedIn ? (
          <div className="text-center py-12 max-w-sm mx-auto">
            <div className="w-16 h-16 bg-primary/8 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-foreground" />
            </div>
            <h2 className="font-semibold text-foreground mb-2">No notifications yet</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Login to receive shipment updates and alerts.
            </p>
            <Button
              onClick={() => setLocation('/login')}
              className="doc-btn-cta h-11 px-6"
              data-testid="button-login-notifications"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 max-w-sm mx-auto">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-foreground mb-2">No notifications yet</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You'll see updates here when you have shipments.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((notif) => {
              const unread = notif.is_read !== true;
              const isWarn =
                notif.type === 'exception' ||
                notif.type === 'customs_hold' ||
                (notif.title ?? '').toLowerCase().includes('hold');
              const isShipmentCreated = notif.type === 'shipment_created';
              const data = parseNotifData(notif.data);
              return (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => void handleNotificationClick(notif)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-all',
                    unread
                      ? 'bg-primary/[0.04] border-border border-l-4 border-l-[lab(34.0831_-9.57756_-27.7093)] shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.08),_0_1px_3px_oklch(17%_0.048_248_/_0.05)]'
                      : 'bg-white border-border shadow-[0_1px_3px_oklch(17%_0.048_248_/_0.04)] hover:shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.08)]'
                  )}
                  data-testid={`notification-item-${notif.id}`}
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      isWarn && !isShipmentCreated
                        ? 'bg-amber-50 text-amber-600'
                        : isShipmentCreated
                          ? 'bg-primary/8 text-foreground'
                          : 'bg-muted text-secondary'
                    )}
                  >
                    {isWarn && !isShipmentCreated ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <Info className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        'font-semibold text-sm leading-snug',
                        unread ? 'text-foreground' : 'text-foreground'
                      )}>
                        {notif.title ?? ''}
                      </p>
                      {unread && (
                        <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {notif.body ?? ''}
                    </p>
                    <div className="flex items-center justify-between mt-2 gap-3">
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatTime(notif.created_at)}
                      </p>
                      {data.awb && (
                        <span className="text-[10px] font-mono font-semibold text-secondary bg-[#2F4468]/8 px-2 py-0.5 rounded-full">
                          {data.awb}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

