import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronRight, MapPin, Package, Headphones } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import bombinoLogo from '@assets/image_1768167970562.png';

const slides = [
  {
    icon: Package,
    title: 'Create shipments on the go',
    subtitle: 'Book shipments at the best rates',
    color: 'text-amber-600',
    bgGradient: 'from-amber-100/80 to-amber-50/50',
  },
  {
    icon: MapPin,
    title: 'Track shipments in real-time',
    subtitle: 'Status, ETA, and hold-up alerts in one place.',
    color: 'text-primary',
    bgGradient: 'from-primary/10 to-primary/5',
  },
  {
    icon: Headphones,
    title: 'Rates, history and AI support',
    subtitle: 'Check rates, view past orders, and get 24x7 support for queries',
    color: 'text-emerald-600',
    bgGradient: 'from-emerald-100/80 to-emerald-50/50',
  },
];

export default function Onboarding() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [, setLocation] = useLocation();
  const { setHasSeenOnboarding } = useAppStore();

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const completeOnboarding = () => {
    setHasSeenOnboarding(true);
    setLocation('/home');
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLast = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 bg-white flex flex-col safe-top safe-bottom" data-testid="screen-onboarding">
      <div className="flex items-center justify-between p-4">
        <img src={bombinoLogo} alt="Bombino Express" className="h-10 w-auto" />
        <button
          onClick={handleSkip}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted active:scale-95"
          data-testid="button-skip"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div
          className={cn(
            'w-32 h-32 rounded-full flex items-center justify-center mb-8 bg-gradient-to-br transition-all duration-200',
            slide.bgGradient
          )}
          key={currentSlide}
        >
          <Icon className={cn('w-14 h-14 animate-scale-in', slide.color)} />
        </div>

        <h2 
          className="text-2xl font-semibold text-center text-foreground animate-slide-up leading-tight"
          key={`title-${currentSlide}`}
        >
          {slide.title}
        </h2>
        <p 
          className="text-muted-foreground text-center mt-3 max-w-xs animate-slide-up leading-relaxed"
          style={{ animationDelay: '50ms' }}
          key={`subtitle-${currentSlide}`}
        >
          {slide.subtitle}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={cn(
              'h-2 rounded-full transition-all duration-200',
              index === currentSlide
                ? 'w-8 bg-primary'
                : 'w-2 bg-muted hover:bg-muted-foreground/30'
            )}
            data-testid={`dot-${index}`}
          />
        ))}
      </div>

      <div className="px-6 pb-8">
        <Button
          onClick={handleNext}
          className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
          data-testid="button-next"
        >
          {isLast ? 'Get Started' : 'Next'}
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
      </div>
    </div>
  );
}