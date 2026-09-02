import { useLocation } from 'wouter';
import { ArrowRight, Phone } from 'lucide-react';
import { DOC_SLOT_SPECS, type DocSlot } from '@shared/accountSpec';
import { useAppStore } from '@/lib/store';
import { useVerificationState } from '@/hooks/useVerificationState';

/**
 * The standing notice on an account that deferred its documents.
 *
 * Read as a piece of unfinished onboarding, not an error. The customer has
 * done nothing wrong: they opened an account in ninety seconds and there is
 * one thing left. So this is a progress row, not a hazard strip. Amber marks
 * how far along they are and the action that finishes it, and carries no
 * meaning elsewhere in the component.
 *
 * That framing is also why it shows a count. "2 of 2 left" is a smaller thing
 * to be told, every screen, than a warning triangle, and it changes as they
 * work, which a warning never does.
 *
 * Sits directly beneath the nav and scrolls away with the page. Not pinned:
 * a persistent strip inside sticky chrome would hold a slice of every screen
 * for as long as the account is unverified, which on a phone is the difference
 * between a reminder and an obstruction.
 *
 *   mobile   TopBar's `below` slot, passed by Header, plus CreateShipment and
 *            Notifications, which render their own headers. Each mount is
 *            `md:hidden`, since those headers are.
 *   desktop  AppLayout, after DesktopTopBar
 *
 * Not rendered on the order and shipment detail screens on mobile, which have
 * no sticky nav to sit under. Desktop covers them through AppLayout.
 */

const WHATSAPP_SUPPORT = 'https://api.whatsapp.com/send?phone=917045999553';

/** "Aadhaar Card and PAN Card". */
function listSlots(slots: DocSlot[]): string {
  const labels = slots.map((slot) => DOC_SLOT_SPECS[slot].label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function VerificationBanner() {
  const [location, setLocation] = useLocation();
  const isLoggedIn = useAppStore((s) => s.isLoggedIn);
  const { data } = useVerificationState({ enabled: isLoggedIn });

  // Signed out, still loading, or finished. Rendering on a half-loaded query
  // would flash a notice on every navigation.
  if (!isLoggedIn || !data || data.verified) return null;

  // The document centre is this component's own destination. Repeating the
  // notice on top of the form it sends people to reads as a system that is
  // not paying attention.
  if (location.startsWith('/profile')) return null;

  const total = data.required.length;
  const outstanding = [...data.missing, ...data.unverified];
  const done = Math.max(total - outstanding.length, 0);

  // "Could not read it" and "you have not sent it" are different sentences.
  // Only the mixed case falls back to counting.
  const detail =
    data.unverified.length > 0 && data.missing.length === 0
      ? `We could not read your ${listSlots(data.unverified)}. A clearer photo should do it.`
      : `Add your ${listSlots(outstanding)} to start shipping.`;

  return (
    <section
      aria-label="Account verification"
      className="border-b border-[oklch(90%_0.042_74)] bg-[oklch(97.6%_0.017_78)]"
      data-testid="verification-banner"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          {/* Progress carries the state, so the row does not need an icon
              shouting at someone who is already doing the right thing. The
              count is text as well as colour. */}
          <span
            className="flex shrink-0 items-center gap-1"
            aria-hidden
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={
                  i < done
                    ? 'h-1.5 w-4 rounded-full bg-[#F2A123]'
                    : 'h-1.5 w-4 rounded-full bg-[oklch(89%_0.035_74)]'
                }
              />
            ))}
          </span>
          <p className="text-[13px] font-semibold leading-tight text-[lab(34.0831_-9.57756_-27.7093)]">
            Finish setting up your account
          </p>
          <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-[#64748B]">
            {done} of {total}
          </span>
        </div>

        <p className="text-xs leading-snug text-[#64748B]">{detail}</p>

        {/* Both routes the customer was promised, as real targets rather than
            inline links. 44px minimum, 8px apart. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation('/profile#documents')}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[lab(34.0831_-9.57756_-27.7093)] px-4 text-[13px] font-semibold text-[#F8F9FA] transition-opacity duration-150 hover:opacity-90 active:opacity-80"
            data-testid="button-verification-complete-online"
          >
            Upload documents
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>

          <a
            href={WHATSAPP_SUPPORT}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[oklch(88%_0.045_74)] bg-white/70 px-4 text-[13px] font-semibold text-[lab(34.0831_-9.57756_-27.7093)] transition-colors duration-150 hover:bg-white active:bg-white"
            data-testid="link-verification-contact-team"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Ask us
          </a>
        </div>
      </div>
    </section>
  );
}
