import { useLocation } from 'wouter';

type PageMeta = { title: string; subtitle: string };

function getPageMeta(path: string): PageMeta | null {
  const map: Record<string, PageMeta> = {
    '/home': { title: 'Dashboard', subtitle: 'Welcome back' },
    '/rates': { title: 'Get Rates', subtitle: 'Calculate shipping costs' },
    '/create': { title: 'Create Shipment', subtitle: 'New international shipment' },
    '/orders': { title: 'My Orders', subtitle: 'Track and manage shipments' },
    '/track': { title: 'Track Shipment', subtitle: 'Real-time shipment status' },
    '/profile': { title: 'My Profile', subtitle: 'Account settings' },
    '/notifications': { title: 'Notifications', subtitle: '' },
  };
  if (path === '/help') return null;
  return map[path] ?? null;
}

export function DesktopTopBar() {
  const [location] = useLocation();
  const meta = getPageMeta(location);

  if (meta === null) {
    return null;
  }

  return (
    <div className="hidden md:flex items-center justify-between h-14 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-8 sticky top-0 z-10 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-0 min-w-0">
        <span className="text-[15px] font-semibold text-[#1E3A4A] truncate">
          {meta.title}
        </span>
        {meta.subtitle ? (
          <>
            <span className="text-[15px] font-semibold text-[#1E3A4A] mx-0">
              {' · '}
            </span>
            <span className="text-xs text-gray-400 ml-2 truncate">{meta.subtitle}</span>
          </>
        ) : null}
      </div>
      {location === '/rates' ? (
        <span className="text-xs text-gray-400 shrink-0">Prices include GST</span>
      ) : null}
    </div>
  );
}
