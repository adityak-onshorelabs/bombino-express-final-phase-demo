import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { BUILD_COMMIT, nativeShellLabel, webBuildLabel } from '@/lib/buildInfo';

/**
 * "Bombino Express v26.10.13 #2", with the store app's own version on a
 * second line inside the iOS or Android app.
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
    <div className={cn('text-[10px] text-muted-foreground', className)} title={BUILD_COMMIT}
      data-commit={BUILD_COMMIT}
      data-testid="text-build-version"
    >
      <p>Bombino Express {webBuildLabel()}</p>
      {shell && <p>App {shell}</p>}
    </div>
  );
}
