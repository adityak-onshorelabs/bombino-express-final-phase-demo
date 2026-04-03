import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Search, ArrowRight, BadgeDollarSign, Send, Phone, Bell, ChevronRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { StatusBadge } from '@/components/StatusBadge';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import whatsAppLogo from '@/assets/WhatsApp.svg.png';


function WhyBombinoSection() {
  return (
    <section className="pt-2 text-center" data-testid="zone-trust">
      <div className="px-1 pb-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground/90 mb-1">Why <span className="text-primary">Bombino</span>?</h2>
        <p className="text-xs text-muted-foreground/90 tracking-wide">Trusted worldwide. Reliable, efficient, premium logistics.</p>
      </div>

      <div className="flex flex-wrap justify-center gap-x-8 gap-y-8 sm:gap-x-10">
        <div className="flex flex-col items-center min-w-0 flex-1 basis-24">
          <p className="text-[1.625rem] font-bold tabular-nums tracking-tight leading-none text-foreground">
            <span className="metric-number-shimmer">30+</span>
          </p>
          <p className="text-sm font-medium text-gray-500 tracking-tight mt-0.5 min-h-[2.25rem] flex items-center justify-center">Years</p>
          <p className="text-xs text-muted-foreground mt-3 tracking-wide max-w-[11rem]">Of global logistics excellence</p>
        </div>

        <div className="flex flex-col items-center min-w-0 flex-1 basis-24">
          <p className="text-[1.625rem] font-bold tabular-nums tracking-tight leading-none text-foreground">
            <span className="metric-number-shimmer">140+</span>
          </p>
          <p className="text-sm font-medium text-gray-500 tracking-tight mt-0.5 min-h-[2.25rem] flex items-center justify-center">Kilograms</p>
          <p className="text-xs text-muted-foreground mt-3 tracking-wide max-w-[11rem]">Shipped around the world per hour</p>
        </div>

        <div className="flex flex-col items-center min-w-0 flex-1 basis-24">
          <p className="text-[1.625rem] font-bold tabular-nums tracking-tight leading-none text-foreground">
            <span className="metric-number-shimmer">250+</span>
          </p>
          <p className="text-sm font-medium text-gray-500 tracking-tight mt-0.5 min-h-[2.25rem] flex items-center justify-center">Happy Clients</p>
          <p className="text-xs text-muted-foreground mt-3 tracking-wide max-w-[11rem]">Sending and receiving shipments worldwide</p>
        </div>
      </div>
    </section>
  );
}


export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [, setLocation] = useLocation();
  const { isLoggedIn, user, shipments, notifications } = useAppStore();

  const userShipments = isLoggedIn 
    ? shipments.filter(s => s.userId === user?.id).slice(0, 2) 
    : [];
  const userNotifications = isLoggedIn 
    ? notifications.filter(n => n.userId === user?.id).slice(0, 2) 
    : [];

  const handleTrack = () => {
    if (trackingNumber.trim()) {
      setLocation(`/shipment/${trackingNumber.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="screen-home">
      <Header onMenuClick={() => setMenuOpen(true)} />
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="px-4 py-5 max-w-md mx-auto space-y-7">
        {isLoggedIn && (
          <div className="mb-6">
            <p className="text-muted-foreground text-sm">
              Welcome back, <span className="font-semibold text-foreground">{user?.fullName?.split(' ')[0] || user?.email}</span>
            </p>
          </div>
        )}

        {/* ZONE 1: Hero - Track Shipment (Primary Action) */}
        <div 
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-5 shadow-[0_8px_24px_rgba(198,40,40,0.08)]"
          data-testid="zone-hero"
        >
          <div className="relative z-10">
            <h1 className="text-lg font-semibold text-foreground mb-1">Track your shipment</h1>
            <p className="text-sm text-muted-foreground mb-4">Enter AWB number to get real-time status</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. BMB123456789"
                  className="h-12 pl-10 text-sm bg-white border-border rounded-xl shadow-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                  data-testid="input-tracking"
                />
              </div>
              <Button
                onClick={handleTrack}
                className="h-12 px-5 bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/25 active:scale-[0.97] transition-all font-semibold"
                data-testid="button-track"
              >
                Track
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>

        {/* ZONE 2: Action Strip - Core Actions */}
        <div className="flex gap-3" data-testid="zone-actions">
          <Link
            href="/rates"
            className="flex-1 flex items-center gap-3 p-4 bg-white rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-amber-200/80 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all"
            data-testid="button-get-rates"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 border border-amber-100/80">
              <BadgeDollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">Get Rates</p>
              <p className="text-[11px] text-muted-foreground">Check costs</p>
            </div>
          </Link>

          <Link
            href="/create"
            className="flex-1 flex items-center gap-3 p-4 bg-white rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-primary/20 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all"
            data-testid="button-ship"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/10">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">Ship Now</p>
              <p className="text-[11px] text-muted-foreground">Create shipment</p>
            </div>
          </Link>
        </div>

        {/* ZONE 3: Auth Banner (Guest Only) */}
        {!isLoggedIn && (
          <div className="flex items-center justify-between py-4 px-1" data-testid="zone-auth">
            <p className="text-sm text-muted-foreground">Sign in to manage your shipments</p>
            <div className="flex gap-2.5">
              <Link href="/login">
                <Button size="sm" className="h-9 px-4 bg-primary hover:bg-primary/90 rounded-xl text-xs font-medium shadow-[0_2px_8px_rgba(198,40,40,0.2)]" data-testid="button-login">
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" variant="outline" className="h-9 px-4 rounded-xl text-xs font-medium border-border text-foreground hover:bg-muted/80" data-testid="button-signup">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ZONE 4: Support + Trust (Guest Only) */}
        {!isLoggedIn && (
          <>
            {/* Support Pills - refined */}
            <div className="flex gap-3" data-testid="zone-support">
              <a
                href="https://wa.me/0000000000?text=Hi%20Bombino%20Support"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-border text-green-700 text-sm font-medium shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-green-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all"
                data-testid="button-whatsapp-home"
              >
                <img src={whatsAppLogo} alt="WhatsApp" className="w-4 h-4 object-contain" />
                WhatsApp
              </a>
              <a
                href="tel:+10000000000"
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-border text-foreground text-sm font-medium shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-primary/20 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all"
                data-testid="button-call-home"
              >
                <Phone className="w-4 h-4 text-muted-foreground" />
                Call Us
              </a>
            </div>

            <WhyBombinoSection />
          </>
        )}

        {/* Logged-in: My Shipments */}
        {isLoggedIn && userShipments.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">My Shipments</h2>
              <Link href="/receive" className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {userShipments.map((shipment) => (
                <Link
                  key={shipment.id}
                  href={`/shipment/${shipment.awb}`}
                  className="block bg-white rounded-xl border border-border p-4 hover:border-primary/20 hover:shadow-sm active:scale-[0.99] transition-all"
                  data-testid={`shipment-card-${shipment.awb}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{shipment.awb}</span>
                    <StatusBadge status={shipment.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{shipment.destCity}, {shipment.destCountry}</span>
                    <span>${shipment.priceEstimate}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Logged-in: Recent Updates */}
        {isLoggedIn && userNotifications.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">Recent Updates</h2>
              <Link href="/notifications" className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {userNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-start gap-3 p-3.5 bg-white rounded-xl border border-border"
                  data-testid={`notification-${notif.id}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    notif.severity === 'warn' ? 'bg-amber-100' : 'bg-blue-100'
                  }`}>
                    <Bell className={`w-4 h-4 ${
                      notif.severity === 'warn' ? 'text-amber-600' : 'text-blue-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{notif.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logged-in: Empty State */}
        {isLoggedIn && userShipments.length === 0 && (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full flex items-center justify-center mx-auto mb-3">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium text-foreground text-sm mb-1">No shipments yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first shipment to get started</p>
            <Button
              onClick={() => setLocation('/create')}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-sm h-10 px-5 rounded-xl shadow-md"
            >
              Create Shipment
            </Button>
          </div>
        )}

        {isLoggedIn && <WhyBombinoSection />}
      </main>

      <BottomNav />
    </div>
  );
}