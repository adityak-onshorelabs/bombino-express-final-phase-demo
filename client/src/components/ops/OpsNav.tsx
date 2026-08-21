import { TabBar, type TabItem } from '@/components/TabBar';
import { OPS_NAV } from '@/lib/opsNav';

/**
 * Ops mobile bottom navigation — five tabs. Transactions stays on the
 * desktop rail only (Phase 2 stub; six labels do not fit a 360px bar).
 */
export function OpsNav() {
  const items: TabItem[] = OPS_NAV.filter((item) => item.mobile).map((item) => ({
    icon: item.icon,
    label: item.mobileLabel,
    path: item.path,
  }));

  return <TabBar items={items} testId="ops-nav" />;
}
