import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Track() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    setLocation('/receive');
  }, [setLocation]);

  return null;
}