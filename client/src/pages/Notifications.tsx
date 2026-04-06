import { ArrowLeft, Bell, AlertTriangle, Info, LogIn } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { useAppStore } from '@/lib/store';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function Notifications() {
  const [, setLocation] = useLocation();
  const { isLoggedIn, notifications, user, markNotificationRead } = useAppStore();

  const userNotifications = isLoggedIn 
    ? notifications.filter(n => n.userId === user?.id)
    : [];

  const handleNotificationClick = (id: string) => {
    markNotificationRead(id);
  };

  return (
    <div className="min-h-screen bg-background" data-testid="screen-notifications">
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
        ) : userNotifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-foreground mb-2">No notifications yet</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">You'll see updates here when you have shipments.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {userNotifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleNotificationClick(notif.id)}
                className={cn(
                  'w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-all card-elevated',
                  notif.readAt
                    ? 'bg-card border-border'
                    : 'bg-primary/5 border-primary/20'
                )}
                data-testid={`notification-item-${notif.id}`}
              >
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  notif.severity === 'warn' ? 'bg-gradient-to-br from-amber-100 to-amber-50' : 'bg-gradient-to-br from-blue-100 to-blue-50'
                )}>
                  {notif.severity === 'warn' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Info className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'font-medium text-sm',
                      !notif.readAt && 'text-primary'
                    )}>
                      {notif.title}
                    </p>
                    {!notif.readAt && (
                      <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{notif.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {format(notif.createdAt, 'MMM d, h:mm a')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}