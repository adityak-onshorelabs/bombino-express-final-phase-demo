import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import bombinoLogo from '@assets/image_1768167970562.png';

export default function Splash() {
  const [, setLocation] = useLocation();
  const { hasSeenOnboarding } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasSeenOnboarding) {
        setLocation('/home');
      } else {
        setLocation('/onboarding');
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [hasSeenOnboarding, setLocation]);

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center" data-testid="screen-splash">
      <div className="animate-scale-in flex flex-col items-center">
        <img 
          src={bombinoLogo} 
          alt="Bombino Express - Bringing the world closer" 
          className="w-64 h-auto object-contain"
          data-testid="img-splash-logo"
        />
      </div>
      <div className="absolute bottom-12 flex flex-col items-center animate-fade-in" style={{ animationDelay: '400ms' }}>
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/30 animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}