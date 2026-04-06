import { X, User, LogOut, LogIn, HelpCircle, Phone } from 'lucide-react';
import { Link } from 'wouter';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/queryClient';
import bombinoLogo from '@/assets/image_1768167970562.png';
import whatsAppLogo from '@/assets/WhatsApp.svg.png';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { isLoggedIn, user, logout } = useAppStore();

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 animate-fade-in"
        onClick={onClose}
        data-testid="overlay-menu"
      />
      <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl animate-slide-in-left safe-top safe-bottom">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <img src={bombinoLogo} alt="Bombino" className="h-9 w-auto" />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
              data-testid="button-close-menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {isLoggedIn ? (user?.fullName || user?.email) : 'Guest'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isLoggedIn ? user?.email : 'Sign in to continue'}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {isLoggedIn ? (
              <>
                <Link
                  href="/profile"
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all"
                  data-testid="link-profile"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">My Profile</span>
                </Link>
                <button
                  onClick={() => {
                    apiRequest('POST', '/api/auth/logout').catch(() => {});
                    logout();
                    onClose();
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all w-full text-left"
                  data-testid="button-logout"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <LogOut className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className="font-medium">Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all"
                data-testid="link-login"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <LogIn className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium">Sign In</span>
              </Link>
            )}

            <div className="border-t border-border my-4" />

            <a
              href="https://wa.me/0000000000?text=Hi%20Bombino%20Support"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all"
              data-testid="link-whatsapp"
            >
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <img src={whatsAppLogo} alt="WhatsApp" className="w-5 h-5 object-contain" />
              </div>
              <span className="font-medium">WhatsApp Support</span>
            </a>

            <a
              href="tel:+10000000000"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all"
              data-testid="link-call"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Phone className="w-5 h-5 text-blue-600" />
              </div>
              <span className="font-medium">Call Support</span>
            </a>

            <Link
              href="/help"
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all"
              data-testid="link-help"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="font-medium">Help & FAQ</span>
            </Link>
          </nav>

          <div className="p-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Bombino Express v1.0.0
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-in-left {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.2s ease-out;
        }
      `}</style>
    </>
  );
}