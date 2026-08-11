import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';

/**
 * The customer surface's bottom navigation.
 *
 * Presentation only: the surface owns its own item list and its responsive
 * behaviour (the customer bar hides on desktop).
 *
 * The agent surface used to render this too. It no longer does — the docket
 * grammar changed the bar's height, its labels' family, and how the active item
 * is marked, so `AgentNav` draws its own. Anything changed here stays on the
 * customer app, which is the point.
 */

export interface TabItem {
  icon: LucideIcon;
  label: string;
  path: string;
  /** Small count on the icon. Omit or pass 0 to hide. */
  badge?: number;
}

export function TabBar({
  items,
  className,
  testId = 'tab-bar',
}: {
  items: TabItem[];
  className?: string;
  testId?: string;
}) {
  const [location] = useLocation();

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 bg-primary shadow-[0_-4px_12px_rgba(0,0,0,0.12)] safe-bottom',
        className,
      )}
      data-testid={testId}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {items.map(({ icon: Icon, label, path, badge }) => {
          // Exact match for surface roots ('/home', '/agent') so a detail route
          // doesn't light up two tabs at once; prefix match for the rest.
          const isRoot = path === '/home' || path === '/agent';
          const isActive = isRoot
            ? location === path || (path === '/home' && location === '/')
            : location.startsWith(path);

          return (
            <Link
              key={path}
              href={path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full transition-all relative active:scale-95',
                isActive ? 'text-white' : 'text-white/65',
              )}
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="relative">
                <Icon className={cn('w-5 h-5 transition-all', isActive && 'stroke-[2.5]')} />
                {typeof badge === 'number' && badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#F2A123] text-[10px] font-bold text-[#1B2A41] grid place-items-center tabular-nums"
                    data-testid={`nav-badge-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[10px] mt-1 transition-all',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {label}
              </span>
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-white rounded-full"
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
