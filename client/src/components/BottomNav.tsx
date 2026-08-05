import { Home, BadgeDollarSign, Send, PackageSearch } from 'lucide-react';
import { SupportFab } from '@/components/SupportFab';
import { TabBar, type TabItem } from '@/components/TabBar';

/**
 * Customer bottom navigation.
 *
 * Presentation moved to the shared `TabBar` so the agent surface renders the
 * identical bar rather than a copy that drifts. This file keeps what is
 * customer-specific: the destinations, the support FAB, and hiding on desktop
 * where the sidebar takes over.
 */
/**
 * Destinations, ordered by how often a customer needs them, with the money
 * action (Ship) in the centre where the thumb rests.
 *
 * Track and Orders are one destination, not two. They answered the same
 * question — "where is my stuff?" — and splitting them forced a customer to
 * guess whether a given shipment lived under one tab or the other. Shipments
 * carries the list, with the look-up-any-AWB field at the top of it.
 */
const navItems: TabItem[] = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: BadgeDollarSign, label: 'Rates', path: '/rates' },
  { icon: Send, label: 'Ship', path: '/create' },
  { icon: PackageSearch, label: 'Shipments', path: '/orders' },
];

export function BottomNav() {
  return (
    <>
      <div className="md:hidden">
        <SupportFab />
      </div>
      <TabBar items={navItems} className="md:hidden" testId="bottom-nav" />
    </>
  );
}
