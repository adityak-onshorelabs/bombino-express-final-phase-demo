import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { useLocation, Link } from 'wouter';
import { Search, ArrowRight, BadgeDollarSign, Send, Phone, Bell } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { StatusBadge } from '@/components/StatusBadge';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { currentGreeting } from '@/lib/greeting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import whatsAppLogo from '@/assets/WhatsApp.svg.png';
import bombinoLogo from '@/assets/bombino-logo.png';
import { fetchMergedShipmentRows, type DisplayRow } from '@/lib/shipmentRows';
import HomeDesktop from '@/pages/HomeDesktop';
import { DocPage, DocSection, DocRows } from '@/components/doc/DocPage';

interface HomeNotificationRow {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  created_at: string;
}

/**
 * Trust figures, set as a ledger rather than a marketing hero.
 *
 * Was three centred display numbers with a shimmer animation — the last block
 * on this screen still speaking the old language. The figures themselves are
 * worth keeping for a first-time visitor; the presentation is now the same
 * mono-and-hairline treatment as everything else, and it sits below the fold.
 */
const TRUST_FIGURES = [
  { value: '30+', unit: 'Years', note: 'Of global logistics excellence' },
  { value: '140+', unit: 'Kg / hour', note: 'Shipped around the world' },
  { value: '250+', unit: 'Clients', note: 'Sending and receiving worldwide' },
] as const;

function WhyBombinoSection() {
  return (
    <section className="mt-8" data-testid="zone-trust">
      <div className="doc-rule pt-5">
        <h2 className="doc-label">Why Bombino</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Trusted worldwide. Reliable, efficient, premium logistics.
        </p>

        <dl className="mt-4">
          {TRUST_FIGURES.map(({ value, unit, note }, i) => (
            <div
              key={unit}
              className={cn(
                'flex items-baseline gap-4 py-3',
                i > 0 && 'border-t border-border',
              )}
            >
              <dt className="doc-mono text-xl font-semibold text-foreground tabular-nums w-16 shrink-0">
                {value}
              </dt>
              <dd className="min-w-0">
                <span className="doc-label block">{unit}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}


export default function Home() {
  const isMobile = useIsMobile();

  // ─── DESKTOP: delegate to the new desktop view (mobile path below is untouched) ───
  if (!isMobile) {
    return <HomeDesktop />;
  }

  // ─── MOBILE (unchanged from original) ──────────────────────────────────────────
  return <HomeMobile />;
}

function HomeMobile() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [, setLocation] = useLocation();
  const { isLoggedIn, user } = useAppStore();

  const [shipmentsLoading, setShipmentsLoading] = useState(isLoggedIn);
  const [shipmentsError, setShipmentsError] = useState(false);
  const [shipmentRows, setShipmentRows] = useState<DisplayRow[]>([]);

  const [notificationsError, setNotificationsError] = useState(false);
  const [apiNotifications, setApiNotifications] = useState<HomeNotificationRow[]>([]);

  const loadHomeData = useCallback(async () => {
    if (!isLoggedIn) {
      setShipmentRows([]);
      setApiNotifications([]);
      setShipmentsError(false);
      setNotificationsError(false);
      setShipmentsLoading(false);
      return;
    }
    setShipmentsLoading(true);
    setShipmentsError(false);
    setNotificationsError(false);

    try {
      setShipmentRows(await fetchMergedShipmentRows());
    } catch {
      setShipmentsError(true);
      setShipmentRows([]);
    }

    const notifRes = await fetch('/api/notifications', { credentials: 'include' }).catch(() => null);
    if (!notifRes || !notifRes.ok) {
      setNotificationsError(true);
      setApiNotifications([]);
    } else {
      const raw = (await notifRes.json().catch(() => [])) as HomeNotificationRow[];
      setApiNotifications(Array.isArray(raw) ? raw : []);
    }

    setShipmentsLoading(false);
  }, [isLoggedIn]);

  useLayoutEffect(() => {
    if (isLoggedIn) {
      setShipmentsLoading(true);
    } else {
      setShipmentsLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

  const userShipments = shipmentRows.slice(0, 2);
  const userNotifications = apiNotifications.slice(0, 3);

  const handleTrack = () => {
    if (trackingNumber.trim()) {
      setLocation(`/shipment/${trackingNumber.trim()}`);
    }
  };

  return (
    <>
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <DocPage
        /* Who you are signed in as belongs in the chrome, not as a block of
           page content pushing the primary task down. Falls back to the
           product name when signed out, where there is no name to greet. */
        eyebrow={isLoggedIn ? currentGreeting() : undefined}
        title={
          isLoggedIn ? (
            user?.fullName?.split(' ')[0] || user?.email || 'Account'
          ) : (
            /* Signed out there is no name to show, so the mark speaks instead
               of setting the product name in a nav-bar label. */
            <img
              src={bombinoLogo}
              alt="Bombino Express"
              className="h-9 w-auto object-contain"
            />
          )
        }
        onMenuClick={() => setMenuOpen(true)}
        testId="screen-home"
        headerRight={
          <Link
            href="/notifications"
            className="tap-target focus-ring hover:bg-muted transition-colors"
            style={{ borderRadius: 'var(--doc-radius)' }}
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </Link>
        }
      >
        {/* The screen's one emphasis panel. Tracking is the most frequent task
            a courier customer has, and the flat treatment gave it no more
            weight than the footer. Same panel shape customers already know
            from the previous hero, minus the gradient and blur shadow. */}
        <div className="doc-panel" data-testid="zone-hero">
          <h2 className="doc-label">Track any order</h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            Enter an AWB number for live status.
          </p>
          <div className="flex gap-2 mt-3">
            <div
              className="flex flex-1 items-stretch border border-border bg-card focus-within:border-accent transition-colors min-w-0"
              style={{ borderRadius: 'var(--doc-radius)' }}
            >
              <span className="flex items-center pl-3 text-muted-foreground">
                <Search className="w-4 h-4" />
              </span>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="AWB number"
                className="doc-mono h-12 flex-1 min-w-0 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 rounded-none"
                onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                data-testid="input-tracking"
              />
            </div>
            {/* .doc-btn is the full-width stamped CTA — it applies w-full,
                which starved the input beside it. This one sizes to content. */}
            <Button
              onClick={handleTrack}
              disabled={!trackingNumber.trim()}
              className="doc-btn-cta h-12 px-5 shrink-0 text-xs uppercase tracking-[0.1em]"
              data-testid="button-track"
            >
              Track
            </Button>
          </div>
        </div>

        {/* Two tiles rather than ruled rows: these are alternatives of equal
            weight, and a list would imply an order between them. */}
        <DocSection label="Quick actions">
          <div className="flex gap-2.5" data-testid="zone-actions">
            <Link href="/rates" className="doc-tile focus-ring" data-testid="button-get-rates">
              <span className="doc-tile-icon">
                <BadgeDollarSign className="w-[18px] h-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">Get rates</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">Check costs</span>
              </span>
            </Link>
            <Link href="/create" className="doc-tile focus-ring" data-testid="button-ship">
              <span className="doc-tile-icon">
                <Send className="w-[18px] h-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">Ship now</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Create shipment
                </span>
              </span>
            </Link>
          </div>
        </DocSection>

        {isLoggedIn && !shipmentsError && (
          <DocSection label="My shipments" action={{ label: 'View all', href: '/orders' }}>
            {shipmentsLoading ? (
              <DocRows>
                <div className="doc-choice animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-32 bg-muted rounded" />
                    <div className="h-3 w-20 bg-muted rounded" />
                  </div>
                </div>
                <div className="doc-choice animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 bg-muted rounded" />
                    <div className="h-3 w-24 bg-muted rounded" />
                  </div>
                </div>
              </DocRows>
            ) : userShipments.length > 0 ? (
              <DocRows>
                {userShipments.map((row) => {
                  const dest = [row.city, row.country].filter(Boolean).join(', ') || '—';
                  return (
                    <Link
                      key={row.key}
                      href={`${row.isOrder ? '/order' : '/shipment'}/${encodeURIComponent(row.displayId)}`}
                      className="doc-choice focus-ring"
                      data-testid={`shipment-card-${row.displayId}`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          {row.isOrder && <span className="doc-label text-[9px]">Order</span>}
                          <span className="doc-mono text-sm font-semibold text-foreground">
                            {row.displayId}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="truncate">{dest}</span>
                          {row.amountStr && (
                            <>
                              <span className="text-border">·</span>
                              <span className="doc-mono">{row.amountStr}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <StatusBadge status={row.statusLabel} tone={row.statusTone} />
                    </Link>
                  );
                })}
              </DocRows>
            ) : (
              <p
                className="text-sm text-muted-foreground py-6 text-center border border-border"
                style={{ borderRadius: 'var(--doc-radius)' }}
              >
                No shipments yet
              </p>
            )}
          </DocSection>
        )}

        {isLoggedIn && !notificationsError && (
          <DocSection label="Recent updates" action={{ label: 'View all', href: '/notifications' }}>
            {userNotifications.length > 0 ? (
              <DocRows>
                {userNotifications.map((notif) => (
                  <div key={notif.id} className="doc-choice" data-testid={`notification-${notif.id}`}>
                    <Bell className="w-[18px] h-[18px] text-accent shrink-0 mt-0.5" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {notif.title ?? ''}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.body ?? ''}
                      </span>
                    </span>
                  </div>
                ))}
              </DocRows>
            ) : (
              <p
                className="text-sm text-muted-foreground py-6 text-center border border-border"
                style={{ borderRadius: 'var(--doc-radius)' }}
              >
                No recent updates
              </p>
            )}
          </DocSection>
        )}

        {/* Signed out: the ask, then support, then the marketing block last.
            It used to sit above the fold on the screen people open most. */}
        {!isLoggedIn && (
          <>
            <div className="doc-rule mt-8 pt-5">
              <p className="text-sm text-muted-foreground">
                Sign in to see your shipments and book a pickup.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Link href="/login" className="flex-1">
                  <Button className="doc-btn-cta w-full h-11" data-testid="button-login">
                    Sign in
                  </Button>
                </Link>
                <Link href="/signup" className="flex-1">
                  <Button className="doc-btn-quiet w-full h-11" data-testid="button-signup">
                    Create account
                  </Button>
                </Link>
              </div>
            </div>

            <DocSection label="Need a hand?">
              <DocRows>
                <a
                  href="https://api.whatsapp.com/send?phone=917045999553"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="doc-choice focus-ring"
                  data-testid="button-whatsapp-home"
                >
                  <img
                    src={whatsAppLogo}
                    alt=""
                    className="w-[18px] h-[18px] object-contain shrink-0 mt-0.5"
                  />
                  <span className="flex-1 text-sm font-semibold text-foreground">WhatsApp us</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </a>
                <a
                  href="tel:+912266400000"
                  className="doc-choice focus-ring"
                  data-testid="button-call-home"
                >
                  <Phone className="w-[18px] h-[18px] text-accent shrink-0 mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-foreground">Call us</span>
                    <span className="doc-mono block text-xs text-muted-foreground mt-0.5">
                      +91 22 6640 0000
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </a>
              </DocRows>
            </DocSection>

            <WhyBombinoSection />
          </>
        )}
      </DocPage>

      <BottomNav />
    </>
  );
}
