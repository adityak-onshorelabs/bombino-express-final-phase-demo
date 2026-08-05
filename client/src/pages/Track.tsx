import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * Legacy alias for `/orders`.
 *
 * Tracking and the shipment list answered the same question — "where is my
 * stuff?" — so they are one destination now. The look-up-any-AWB field lives
 * at the top of `/orders`. This keeps existing `/track` links resolving.
 */
export default function Track() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/orders', { replace: true });
  }, [setLocation]);

  return null;
}
