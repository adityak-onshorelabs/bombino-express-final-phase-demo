import type * as React from 'react';
import { LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { TopBar } from '@/components/TopBar';
import { AgentNav } from './AgentNav';

/**
 * Chrome for every agent screen: the app's shared top bar, a page heading, and
 * the two-tab nav.
 *
 * The bar is the same `TopBar` the customer app uses — same height, blurred
 * white fill, centred logo — so the agent surface reads as the same product.
 * Its destinations differ because they must: the logo goes to `/agent` rather
 * than `/home` (SurfaceGuard would bounce an agent straight back), and the
 * right slot is sign-out rather than notifications, which is a customer feature
 * with no agent route behind it.
 *
 * The page title moved out of the bar and into the body. It was competing with
 * the logo for the same 14px strip, and as a heading it can carry the weight
 * the blunt register calls for.
 */
export function AgentShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const { user, logout } = useAppStore();

  const handleLogout = async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore network failure — still clear the local session.
    }
    logout();
    setLocation('/login');
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-nav" data-testid="agent-shell">
      <TopBar
        homeHref="/agent"
        testId="agent-topbar"
        right={
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Sign out"
            className="p-2 -mr-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
            data-testid="button-agent-logout"
          >
            <LogOut className="w-5 h-5 text-foreground" />
          </button>
        }
      />

      <main className="max-w-md mx-auto px-4 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          <p className="text-sm font-medium text-muted-foreground mt-0.5">
            {subtitle ?? user?.fullName ?? 'Pickup agent'}
          </p>
        </div>

        {children}
      </main>

      <AgentNav />
    </div>
  );
}
