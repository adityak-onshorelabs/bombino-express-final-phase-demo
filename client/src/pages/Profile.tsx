import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  LogOut,
  Phone as PhoneIcon,
  UserCircle,
  Shield,
  Calendar,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import bombinoLogo from '@/assets/image_1768167970562.png';
import whatsAppLogo from '@/assets/WhatsApp.svg.png';
import { BottomNav } from '@/components/BottomNav';

function formatMemberSince(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { isLoggedIn, user, logout } = useAppStore();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/user/profile', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch {
        // silent fallback to Zustand
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background pb-20" data-testid="screen-profile-login-required">
        <header className="sticky top-0 z-50 bg-white border-b border-border safe-top">
          <div className="flex items-center h-14 px-4 max-w-md mx-auto">
            <button
              onClick={() => setLocation('/home')}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="ml-2 font-semibold text-sm">Profile</h1>
          </div>
        </header>

        <main className="px-4 py-12 max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Please login to continue</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in to view your profile
          </p>
          <Button
            onClick={() => setLocation('/login?redirect=/profile')}
            className="bg-primary hover:bg-primary/90 h-11 px-8"
          >
            Login
          </Button>
        </main>

        <BottomNav />
      </div>
    );
  }

  const displayName = profile?.full_name ?? user?.fullName ?? '';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const displayPhone =
    profile != null
      ? profile.phone && String(profile.phone).trim()
        ? String(profile.phone)
        : 'Not set'
      : 'Not set';
  const displayUsername = profile?.username ?? user?.username ?? '';
  const displayRole = profile?.role ?? user?.role ?? '';
  const memberSince = profile?.created_at ? formatMemberSince(profile.created_at) : null;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore network errors; still clear client session
    }
    logout();
    setLocation('/login');
  };

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="screen-profile">
      <header className="sticky top-0 z-50 bg-white border-b border-border safe-top">
        <div className="flex items-center h-14 px-4 max-w-md mx-auto">
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            data-testid="button-back-profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="ml-2 font-semibold text-sm">My Profile</h1>
        </div>
      </header>

      <main className="px-4 py-5 max-w-md mx-auto">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <User className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {displayName}
          </h2>
          <p className="text-sm text-muted-foreground">{displayEmail}</p>
        </div>

        <div className="bg-white rounded-xl border border-border divide-y divide-border mb-4">
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">Email</p>
              <p className="font-medium text-sm">{displayEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center">
              <Phone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">Phone</p>
              <p className="font-medium text-sm">{displayPhone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center">
              <UserCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">Username</p>
              <p className="font-medium text-sm">{displayUsername}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center">
              <Shield className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground">Role</p>
              <p className="font-medium text-sm">{displayRole}</p>
            </div>
          </div>
          {memberSince ? (
            <div className="flex items-center gap-3 p-4">
              <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground">Member since</p>
                <p className="font-medium text-sm">{memberSince}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border border-border divide-y divide-border mb-4">
          <a
            href="https://api.whatsapp.com/send?phone=917045999553"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
            data-testid="link-profile-whatsapp"
          >
            <div className="w-9 h-9 bg-green-50 rounded-full flex items-center justify-center">
              <img src={whatsAppLogo} alt="WhatsApp" className="w-4 h-4 object-contain" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">WhatsApp Support</p>
            </div>
          </a>
          <a
            href="tel:+912266400000"
            className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
            data-testid="link-profile-call"
          >
            <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center">
              <PhoneIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Call Support</p>
            </div>
          </a>
        </div>

        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50 text-sm"
          data-testid="button-profile-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>

        <div className="mt-8 text-center">
          <img src={bombinoLogo} alt="Bombino" className="h-6 w-auto mx-auto mb-1 opacity-40" />
          <p className="text-[10px] text-muted-foreground">Bombino Express v1.0</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
