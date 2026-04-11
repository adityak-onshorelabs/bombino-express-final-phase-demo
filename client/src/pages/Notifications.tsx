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
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm safe-top">
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

      <main className="px-4 py-6 max-w-md mx-auto">
        {!isLoggedIn ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-primary/12 to-primary/6 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground mb-2">No notifications yet</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Login to receive shipment updates and alerts.
            </p>
            <Button
              onClick={() => setLocation('/login')}
              className="btn-primary h-11 px-6 rounded-xl"
              data-testid="button-login-notifications"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
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
              return (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => void handleNotificationClick(notif)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-all',
                    unread
                      ? 'bg-primary/[0.08] border-primary/25 border-l-4 border-l-primary shadow-[0_2px_12px_rgba(198,40,40,0.08),0_1px_3px_rgba(0,0,0,0.05)]'
                      : 'card-elevated'
                  )}
                  data-testid={`notification-item-${notif.id}`}
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                      isShipmentCreated
                        ? 'bg-primary/8 text-primary'
                        : 'bg-gray-100 text-gray-500'
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
                      <p
                        className={cn('font-medium text-sm', unread && 'text-primary')}
                      >
                        {notif.title ?? ''}
                      </p>
                      {unread && (
                        <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {notif.body ?? ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {formatTime(notif.created_at)}
                    </p>
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
