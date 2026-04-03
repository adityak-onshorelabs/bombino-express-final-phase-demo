import { Home, BadgeDollarSign, Send, PackageSearch } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { SupportFab } from '@/components/SupportFab';

const navItems = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: BadgeDollarSign, label: 'Rates', path: '/rates' },
  { icon: Send, label: 'Ship', path: '/create' },
  { icon: PackageSearch, label: 'Orders', path: '/receive' },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <>
      <SupportFab />
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-primary shadow-[0_-4px_12px_rgba(0,0,0,0.12)] safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location === path || 
            (path === '/home' && location === '/') ||
            (path !== '/home' && location.startsWith(path));
          
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full transition-all relative active:scale-95',
                isActive ? 'text-white' : 'text-white/65'
              )}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon className={cn('w-5 h-5 transition-all', isActive && 'stroke-[2.5]')} />
              <span className={cn(
                'text-[10px] mt-1 transition-all',
                isActive ? 'font-semibold' : 'font-medium'
              )}>
                {label}
              </span>
              {isActive && (
                <span className="absolute bottom-1.5 w-6 h-0.5 bg-white/60 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}