import { LayoutGrid } from 'lucide-react';
import { TabBar, type TabItem } from '@/components/TabBar';

/**
 * Ops bottom navigation — Phase 3A only needs the board.
 * Extra tabs (users, etc.) land in 3D.
 */
export function OpsNav() {
  const items: TabItem[] = [
    { icon: LayoutGrid, label: 'Board', path: '/ops' },
  ];

  return <TabBar items={items} testId="ops-nav" />;
}
