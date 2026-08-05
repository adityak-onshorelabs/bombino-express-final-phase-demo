import { useEffect } from 'react';
import { useLocation } from 'wouter';

/** Legacy alias for `/orders`. See Track.tsx. */
export default function Receive() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/orders', { replace: true });
  }, [setLocation]);

  return null;
}
