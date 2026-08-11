import type * as React from 'react';
import { LogOut, ChevronLeft } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import bombinoLogo from '@/assets/bombino-logo.png';
import { AgentNav } from './AgentNav';

/**
 * Chrome for every agent screen.
 *
 * Two shells, because the agent surface has two kinds of screen:
 *
 *   AgentShell     — a list screen. Ruled title block, then bands of panels.
 *   AgentJobSheet  — one job. No app root: a back target, a full-height white
 *                    sheet, and a fixed action bar at thumb height.
 *
 * The top bar is the agent surface's own, not the shared `TopBar`. It is 52px
 * rather than 56, unblurred, and carries an amber "Agent" wordmark tag on the
 * left where the customer bar has nothing — the fastest way to tell an agent
 * they are looking at the agent app is to say so in the one colour this
 * surface reserves for their own work.
 */

function useLogout(): () => Promise<void> {
  const [, setLocation] = useLocation();
  const { logout } = useAppStore();

  return async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore network failure — still clear the local session.
    }
    logout();
    setLocation('/login');
  };
}

/** The app-root bar: who you are, where you are, and the way out. */
function AgentTopBar() {
  const handleLogout = useLogout();

  return (
    <header
      className="sticky top-0 z-40 bg-white border-b border-[#E2E8F0]! safe-top"
      data-testid="agent-topbar"
    >
      {/* 58px rather than the spec's 52: the logo reads too small at 26px on a
          real phone, and a 38px mark needs the height around it. */}
      <div className="flex items-center justify-between h-[58px] px-4 max-w-md mx-auto">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#F2A123]">
          Agent
        </span>

        <Link href="/agent" className="flex items-center justify-center">
          <img
            src={bombinoLogo}
            alt="Bombino Express"
            className="h-[38px] w-auto object-contain"
            data-testid="img-logo"
          />
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Sign out"
          className="w-6 h-6 grid place-items-center"
          data-testid="button-agent-logout"
        >
          <LogOut className="w-[22px] h-[22px] text-[#64748B]" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

export function AgentShell({
  title,
  subtitle,
  titleRight,
  headerExtra,
  children,
}: {
  title: string;
  /** Mono, uppercase, under the title. One line of fact, not encouragement. */
  subtitle?: string;
  /** Mono, uppercase, right-aligned on the title's baseline. */
  titleRight?: React.ReactNode;
  /** Sits below the 2px rule, inside the header block. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background pb-agent-nav" data-testid="agent-shell">
      <AgentTopBar />

      <main className="max-w-md mx-auto px-4 pt-[18px] pb-[18px]">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] leading-none text-[#1B2A41]">
              {title}
            </h1>
            {titleRight}
          </div>
          {subtitle && (
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#64748B] mt-1.5">
              {subtitle}
            </p>
          )}
          {/* The rule is the screen title's underline and the sheet's top edge
              at once — it is what makes the screen read as one document. */}
          <div className="h-0.5 bg-[#1B2A41] mt-[10px]" aria-hidden />
          {headerExtra && <div className="mt-[10px]">{headerExtra}</div>}
        </div>

        <div className="mt-[18px]">{children}</div>
      </main>

      <AgentNav />
    </div>
  );
}

/**
 * The job sheet's shell.
 *
 * Height is pinned to the viewport minus the nav so the sheet scrolls inside
 * itself and the action bar sits still at the bottom of it. The alternative —
 * a `fixed` bar over a normally scrolling page — needs the page to reserve the
 * bar's height, which changes with how many actions the server sends.
 */
export function AgentJobSheet({
  backHref,
  backLabel,
  orderNo,
  actionBar,
  children,
}: {
  backHref: string;
  /** Mono, uppercase: the list this job came from. */
  backLabel: string;
  orderNo?: string;
  actionBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-[calc(100dvh-var(--agent-nav-stack))] flex flex-col bg-white"
      data-testid="agent-job-sheet"
    >
      <header className="flex-none bg-white border-b border-[#E2E8F0]! safe-top">
        <div className="flex items-center gap-2.5 h-[52px] px-4 max-w-md mx-auto">
          <Link href={backHref} className="-ml-1 p-1" data-testid="link-back">
            <ChevronLeft className="w-5 h-5 text-[#1B2A41]" strokeWidth={2.5} />
            <span className="sr-only">Back to {backLabel}</span>
          </Link>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B2A41]">
            {backLabel}
          </span>
          {orderNo && (
            <span className="ml-auto font-mono text-[11px] font-medium text-[#64748B]">
              {orderNo}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto">{children}</div>
      </div>

      {actionBar && (
        <div
          className={cn(
            'flex-none bg-white border-t border-[#E2E8F0]!',
            'px-4 pt-3 pb-3.5',
          )}
          data-testid="agent-action-bar"
        >
          <div className="max-w-md mx-auto flex flex-col gap-2">{actionBar}</div>
        </div>
      )}

      <AgentNav />
    </div>
  );
}
