import { LayoutGrid, PackageSearch, ClipboardList, Wallet, CalendarDays } from 'lucide-react';
import { TabBar, type TabItem } from '@/components/TabBar';
import { useAvailablePickups, useMyPickups } from '@/hooks/useAgentPickups';

/**
 * Agent bottom navigation — the same bar as the customer app, different stops.
 *
 * Five tabs, which is the ceiling: past that, labels truncate and targets fall
 * below the touch minimum on a 360px phone. Ordered by how often a working
 * agent needs them, with the setup screen (Week) last because it is configured
 * once and rarely revisited.
 *
 * Not hidden on desktop: this surface is phone-only, so there is no sidebar to
 * hand over to. No support FAB either; an agent with a problem calls the hub.
 *
 * The two work tabs carry live counts. Both queries are already warm from the
 * screens themselves, so this costs nothing extra.
 */
export function AgentNav() {
  const { data: available } = useAvailablePickups();
  const { data: mine } = useMyPickups();

  const items: TabItem[] = [
    { icon: LayoutGrid, label: 'Today', path: '/agent' },
    { icon: PackageSearch, label: 'Available', path: '/agent/available', badge: available?.length },
    { icon: ClipboardList, label: 'My Jobs', path: '/agent/mine', badge: mine?.length },
    { icon: Wallet, label: 'Collected', path: '/agent/collections' },
    { icon: CalendarDays, label: 'My Week', path: '/agent/schedule' },
  ];

  return <TabBar items={items} testId="agent-nav" />;
}
