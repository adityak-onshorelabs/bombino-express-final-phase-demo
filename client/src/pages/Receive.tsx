import { useState } from 'react';
import { ScanSearch, ArrowRight, PackageSearch, Package } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SideMenu } from '@/components/SideMenu';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { format } from 'date-fns';

export default function Receive() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [error, setError] = useState('');
  const [, setLocation] = useLocation();
  const { isLoggedIn, user, shipments } = useAppStore();

  const incomingShipments = isLoggedIn 
    ? shipments.filter(s => 
        s.userId === user?.id && 
        !['Delivered', 'Exception'].includes(s.status)
      )
    : [];

  const handleTrack = () => {
    const awb = trackingNumber.trim();
    if (!awb) {
      setError('Please enter a tracking number');
      return;
    }
    setLocation(`/shipment/${awb}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="screen-receive">
      <Header onMenuClick={() => setMenuOpen(true)} />
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="px-4 py-5 max-w-md mx-auto">
        <h1 className="text-lg font-semibold text-foreground mb-1">Track & Receive</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Track your incoming shipments
        </p>

        <div className="bg-card rounded-2xl border border-border p-5 mb-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <ScanSearch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Track by AWB</h2>
              <p className="text-xs text-muted-foreground">Enter your tracking number</p>
            </div>
          </div>
          <div className="flex gap-2 mb-2">
            <Input
              value={trackingNumber}
              onChange={(e) => {
                setTrackingNumber(e.target.value);
                setError('');
              }}
              placeholder="Enter AWB number"
              className="h-12 text-sm bg-muted/50 border-0 rounded-xl"
              onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
              data-testid="input-track-awb"
            />
            <Button
              onClick={handleTrack}
              className="h-12 w-12 bg-primary hover:bg-primary/90 rounded-xl shadow-md"
              data-testid="button-track-submit"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
          {error && (
            <div className="text-xs text-red-500 mb-2">{error}</div>
          )}
        </div>

        {isLoggedIn ? (
          incomingShipments.length > 0 ? (
            <div>
              <h2 className="font-semibold text-foreground text-sm mb-3">Incoming Shipments</h2>
              <div className="space-y-2">
                {incomingShipments.map((shipment) => (
                  <Link
                    key={shipment.id}
                    href={`/shipment/${shipment.awb}`}
                    className="block bg-card rounded-xl border border-border p-4 hover:shadow-md transition-all"
                    data-testid={`incoming-shipment-${shipment.awb}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{shipment.awb}</span>
                      <StatusBadge status={shipment.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{shipment.originCity}, {shipment.originCountry} → {shipment.destCity}</span>
                      <span>ETA: {format(shipment.eta, 'MMM d')}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border p-8 text-center shadow-sm">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <PackageSearch className="w-7 h-7 text-primary" />
              </div>
              <p className="font-semibold text-foreground text-sm mb-1">No incoming shipments</p>
              <p className="text-xs text-muted-foreground">
                Track any shipment using the AWB number above
              </p>
            </div>
          )
        ) : (
          <div className="bg-card rounded-2xl border border-border p-8 text-center shadow-sm">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7 text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm mb-1">Track any shipment</p>
            <p className="text-xs text-muted-foreground mb-4">
              Enter an AWB number above to track your package
            </p>
            <p className="text-xs text-muted-foreground">
              <Link href="/login" className="text-primary font-semibold hover:underline">
                Sign in
              </Link>
              {' '}to view your incoming shipments
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}