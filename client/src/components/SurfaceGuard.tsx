import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import {
  isSurfaceAgnostic,
  landingPathForRole,
  surfaceForPath,
  surfaceForRole,
} from '@/lib/surface';

/**
 * A1 — redirects anyone who wanders onto a surface their role doesn't own.
 *
 * COSMETIC ONLY. A customer who types /agent gets bounced to /home, but the
 * protection that matters is server-side: every agent and ops route sits
 * behind `requireRole`, so curling the API directly returns 403 regardless of
 * what this component does. Do not add a security assumption here.
 *
 * Logged-out users are left alone — the pages themselves handle their own
 * "please log in" states, and redirecting here would fight with the
 * `?redirect=` flow that Login and Signup already implement.
 */
export function SurfaceGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { isLoggedIn, user } = useAppStore();

  const mismatched =
    isLoggedIn &&
    !isSurfaceAgnostic(location) &&
    surfaceForPath(location) !== surfaceForRole(user?.role);

  useEffect(() => {
    if (mismatched) {
      setLocation(landingPathForRole(user?.role), { replace: true });
    }
  }, [mismatched, user?.role, setLocation]);

  // Render nothing on the frame where a redirect is queued, so the wrong
  // surface never flashes up before the navigation lands.
  if (mismatched) return null;

  return <>{children}</>;
}
