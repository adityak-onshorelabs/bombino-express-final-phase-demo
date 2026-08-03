import { useEffect, useState } from 'react';
import { Menu, Bell } from 'lucide-react';
import { Link } from 'wouter';
import { useAppStore } from '@/lib/store';
import { TopBar } from '@/components/TopBar';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { isLoggedIn } = useAppStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/notifications/unread-count', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (!res.ok) {
          setUnreadCount(0);
          return;
        }
        const data = (await res.json()) as { count?: number };
        setUnreadCount(typeof data.count === 'number' ? data.count : 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  return (
    <TopBar
      homeHref="/home"
      className="md:hidden"
      testId="header"
      left={
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
          data-testid="button-menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
      }
      right={
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
      }
    />
  );
}
