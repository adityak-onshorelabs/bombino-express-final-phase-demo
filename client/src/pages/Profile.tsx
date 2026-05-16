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
import bombinoLogo from '@/assets/bombino-logo.png';
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
      <div className="min-h-[100dvh] bg-background pb-nav" data-testid="screen-profile-login-required">
        <header className="sticky top-0 z-50 bg-white border-b border-[#E2E8F0] safe-top md:hidden">
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

        <main className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-[lab(34.0831_-9.57756_-27.7093)]/8 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-[lab(34.0831_-9.57756_-27.7093)]" />
          </div>
          <h2 className="text-lg font-semibold text-[lab(34.0831_-9.57756_-27.7093)] mb-2">Please login to continue</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in to view your profile
          </p>
          <Button
            onClick={() => setLocation('/login?redirect=/profile')}
            className="bg-[#F2A123] hover:bg-[#F2A123]/90 text-[lab(34.0831_-9.57756_-27.7093)] font-semibold h-11 px-8 rounded-xl shadow-[0_4px_20px_oklch(17%_0.048_248_/_0.10)]"
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
    <div className="min-h-[100dvh] bg-background pb-nav" data-testid="screen-profile">
      <header className="sticky top-0 z-50 bg-white border-b border-[#E2E8F0] safe-top md:hidden">
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

      <main className="max-w-5xl mx-auto w-full px-4 md:px-8 py-6">
        <div className="md:grid md:grid-cols-12 gap-8 items-start">

          {/* LEFT — avatar + identity */}
          <div className="md:col-span-5 flex flex-col items-center text-center md:text-left md:items-start mb-6 md:mb-0 md:sticky md:top-6">
            <div className="w-20 h-20 bg-[lab(34.0831_-9.57756_-27.7093)]/8 rounded-2xl flex items-center justify-center mb-4 shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.06)]">
              <User className="w-10 h-10 text-[lab(34.0831_-9.57756_-27.7093)]" />
            </div>
            <h2 className="text-xl font-bold text-[lab(34.0831_-9.57756_-27.7093)] leading-tight">
              {displayName || 'User'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{displayEmail}</p>
            {memberSince && (
              <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#2F4468] bg-[#2F4468]/8 px-3 py-1 rounded-full">
                <Calendar className="w-3 h-3" />
                Member since {memberSince}
              </span>
            )}
            <div className="mt-8 hidden md:block">
              <img src={bombinoLogo} alt="Bombino" className="h-6 w-auto mb-1 opacity-30" />
              <p className="text-[10px] text-muted-foreground">Bombino Express v1.0</p>
            </div>
          </div>

          {/* RIGHT — details + support + sign out */}
          <div className="md:col-span-7 space-y-5">
            {/* Details card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] divide-y divide-[#E2E8F0] shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.06),_0_1px_3px_oklch(17%_0.048_248_/_0.04)]">
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 bg-[#F3F4F6] rounded-xl flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[#2F4468]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Email</p>
                  <p className="font-medium text-sm truncate text-[lab(34.0831_-9.57756_-27.7093)]">{displayEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 bg-[#F3F4F6] rounded-xl flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-[#2F4468]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Phone</p>
                  <p className="font-medium text-sm truncate text-[lab(34.0831_-9.57756_-27.7093)]">{displayPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 bg-[#F3F4F6] rounded-xl flex items-center justify-center shrink-0">
                  <UserCircle className="w-4 h-4 text-[#2F4468]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Username</p>
                  <p className="font-medium text-sm truncate text-[lab(34.0831_-9.57756_-27.7093)]">{displayUsername}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 bg-[#F3F4F6] rounded-xl flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#2F4468]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Role</p>
                  <p className="font-medium text-sm truncate text-[lab(34.0831_-9.57756_-27.7093)]">{displayRole}</p>
                </div>
              </div>
            </div>

            {/* Support card */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] divide-y divide-[#E2E8F0] shadow-[0_2px_12px_oklch(17%_0.048_248_/_0.06),_0_1px_3px_oklch(17%_0.048_248_/_0.04)]">
              <a
                href="https://api.whatsapp.com/send?phone=917045999553"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 hover:bg-[#F8F9FA] transition-colors rounded-t-2xl"
                data-testid="link-profile-whatsapp"
              >
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                  <img src={whatsAppLogo} alt="WhatsApp" className="w-4 h-4 object-contain" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-[lab(34.0831_-9.57756_-27.7093)]">WhatsApp Support</p>
                  <p className="text-xs text-muted-foreground">Chat with us instantly</p>
                </div>
              </a>
              <a
                href="tel:+912266400000"
                className="flex items-center gap-3 p-4 hover:bg-[#F8F9FA] transition-colors rounded-b-2xl"
                data-testid="link-profile-call"
              >
                <div className="w-9 h-9 bg-[#2F4468]/8 rounded-xl flex items-center justify-center shrink-0">
                  <PhoneIcon className="w-4 h-4 text-[#2F4468]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-[lab(34.0831_-9.57756_-27.7093)]">Call Support</p>
                  <p className="text-xs text-muted-foreground">+91 22 6640 0000</p>
                </div>
              </a>
            </div>

            {/* Sign out */}
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50 text-sm rounded-xl"
              data-testid="button-profile-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>

            {/* Footer (mobile only) */}
            <div className="mt-4 text-center md:hidden">
              <img src={bombinoLogo} alt="Bombino" className="h-5 w-auto mx-auto mb-1 opacity-30" />
              <p className="text-[10px] text-muted-foreground">Bombino Express v1.0</p>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

