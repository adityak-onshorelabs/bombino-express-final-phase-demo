import type * as React from 'react';
import { LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { TopBar } from '@/components/TopBar';
import { OpsNav } from './OpsNav';
import { cn } from '@/lib/utils';

/**
 * Chrome for every ops screen — same TopBar pattern as AgentShell.
 * Board widens on desktop for phase columns; detail stays readable.
 */
export function OpsShell({
  title,
  subtitle,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
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
    <div className="min-h-[100dvh] bg-background pb-nav" data-testid="ops-shell">
      <TopBar
        homeHref="/ops"
        testId="ops-topbar"
        right={
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Sign out"
            className="p-2 -mr-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
            data-testid="button-ops-logout"
          >
            <LogOut className="w-5 h-5 text-foreground" />
          </button>
        }
      />

      <main
        className={cn(
          'mx-auto px-4 py-4',
          wide ? 'max-w-6xl' : 'max-w-md'
        )}
      >
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          <p className="text-sm font-medium text-muted-foreground mt-0.5">
            {subtitle ?? user?.fullName ?? 'Operations'}
          </p>
        </div>

        {children}
      </main>

      <OpsNav />
    </div>
  );
}
