import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Orders() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    setLocation('/receive');
  }, [setLocation]);

  return null;
}