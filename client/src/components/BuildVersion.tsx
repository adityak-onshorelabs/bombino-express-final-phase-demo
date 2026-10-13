import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { nativeShellLabel, webBuildLabel } from '@/lib/buildInfo';

/**
 * "Bombino Express v1.0.0 · 3d0ac14 · 13 Oct 2026", with the store app's own
 * version on a second line inside the iOS or Android app.
 */
export function BuildVersion({ className }: { className?: string }): React.JSX.Element {
  const [shell, setShell] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void nativeShellLabel().then((label) => {
      if (live) setShell(label);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={cn('text-[10px] text-muted-foreground', className)} data-testid="text-build-version">
      <p>Bombino Express {webBuildLabel()}</p>
      {shell && <p>App {shell}</p>}
    </div>
  );
}
