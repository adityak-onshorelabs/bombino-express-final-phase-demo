/**
 * Ops console destinations — one list so the desktop rail and mobile bar
 * cannot drift. Transactions is desktop-only this phase (five tabs is the
 * mobile ceiling; the ledger is a stub until Phase 2).
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  Send,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

export type OpsNavItem = {
  label: string;
  /** Shorter word for the five-tab mobile bar. */
  mobileLabel: string;
  path: string;
  icon: LucideIcon;
  mobile: boolean;
};

export const OPS_NAV: readonly OpsNavItem[] = [
  {
    label: 'Dashboard',
    mobileLabel: 'Dash',
    path: '/ops/dashboard',
    icon: LayoutDashboard,
    mobile: true,
  },
  {
    label: 'Pickups',
    mobileLabel: 'Pickups',
    path: '/ops/pickups',
    icon: Truck,
    mobile: true,
  },
  {
    label: 'Drop-offs',
    mobileLabel: 'Drops',
    path: '/ops/dropoffs',
    // lucide 0.545 has no PackageDown — Package is the drop-off stand-in.
    icon: Package,
    mobile: true,
  },
  {
    label: 'Dispatched',
    mobileLabel: 'Sent',
    path: '/ops/dispatched',
    icon: Send,
    mobile: true,
  },
  {
    label: 'Transactions',
    mobileLabel: 'Txns',
    path: '/ops/transactions',
    icon: Wallet,
    mobile: false,
  },
  {
    label: 'Users',
    mobileLabel: 'Users',
    path: '/ops/users',
    icon: Users,
    mobile: true,
  },
];

/** Prefix match, but `/ops/orders/:id` does not light any section tab. */
export function isOpsNavActive(location: string, path: string): boolean {
  return location === path || location.startsWith(`${path}/`);
}
