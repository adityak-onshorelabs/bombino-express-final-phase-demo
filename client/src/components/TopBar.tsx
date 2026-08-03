import type * as React from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import bombinoLogo from '@/assets/bombino-logo.png';

/**
 * The app's top bar, shared by every surface.
 *
 * Extracted from the customer `Header` so the agent app wears the same chrome
 * rather than a lookalike that drifts: identical height, blurred white fill,
 * hairline border, centred logo.
 *
 * Only the destinations differ, and they have to. The logo's home is whichever
 * surface you are on — sending an agent to `/home` would bounce them straight
 * back through `SurfaceGuard`. The left and right slots are passed in for the
 * same reason: notifications and the side menu are customer features and have
 * no agent equivalent.
 */
export function TopBar({
  homeHref,
  left,
  right,
  className,
  testId = 'top-bar',
}: {
  homeHref: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-white/95 backdrop-blur-sm safe-top border-b border-[rgba(198,40,40,0.08)] shadow-[0_1px_8px_rgba(0,0,0,0.06)]',
        className,
      )}
      data-testid={testId}
    >
      <div className="relative flex items-center justify-between h-14 px-4 max-w-md mx-auto">
        {/* Empty spans keep the logo optically centred when a slot is unused,
            rather than letting the flex row collapse around it. */}
        {left ?? <span className="w-9" aria-hidden />}

        <Link
          href={homeHref}
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center max-w-[min(200px,55vw)]"
        >
          <img
            src={bombinoLogo}
            alt="Bombino Express"
            className="h-10 w-auto max-w-[180px] object-contain object-center"
            data-testid="img-logo"
          />
        </Link>

        {right ?? <span className="w-9" aria-hidden />}
      </div>
    </header>
  );
}
