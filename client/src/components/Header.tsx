import { Menu, Bell } from 'lucide-react';
import { Link } from 'wouter';
import { useAppStore } from '@/lib/store';
import bombinoLogo from '@/assets/image_1768167970562.png';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { isLoggedIn, notifications, user } = useAppStore();
  
  const unreadCount = isLoggedIn 
    ? notifications.filter(n => n.userId === user?.id && !n.readAt).length 
    : 0;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm safe-top border-b border-border shadow-sm">
      <div className="flex items-center justify-between h-14 px-4 max-w-md mx-auto">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
          data-testid="button-menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
        
        <Link href="/home" className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center max-w-[min(200px,55vw)]">
          <img
            src={bombinoLogo}
            alt="Bombino Express"
            className="h-8 w-auto max-h-8 object-contain object-center"
            data-testid="img-logo"
          />
        </Link>
        
        <Link 
          href="/notifications" 
          className="relative p-2 -mr-2 rounded-xl hover:bg-muted active:scale-95 transition-all" 
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5 text-foreground" />
          {isLoggedIn && unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}