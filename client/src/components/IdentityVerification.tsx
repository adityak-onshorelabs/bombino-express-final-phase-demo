import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DOC_SLOT_SPECS,
  IDENTITY_CHECK_LABELS,
  requiredIdentityChecks,
  type AccountKind,
  type CompanyCategory,
  type VerifiedDocSlot,
} from '@shared/accountSpec';
import { cn } from '@/lib/utils';

/** How often the signup tab asks whether DigiLocker is done. */
const POLL_INTERVAL_MS = 3000;
/** Cashfree's consent URL lasts ten minutes; the server expires it at nine. */
const POLL_CEILING_MS = 9 * 60 * 1000;

export type IdentityKind = 'aadhaar' | 'pan' | 'gstin';

/** What the parent needs: the proved numbers, keyed by the slot they belong to. */
export type VerifiedIdentityNumbers = Partial<Record<VerifiedDocSlot, string>>;

const KIND_BY_SLOT: Record<VerifiedDocSlot, IdentityKind> = {
  aadhaar_card: 'aadhaar',
  pan_card: 'pan',
  gst_certificate: 'gstin',
};

interface VerifiedState {
  documentNo: string;
  /** The name the authority holds. Null when the check was bypassed. */
  verifiedName: string | null;
  bypassed: boolean;
}

interface IdentityVerificationProps {
  accountType: AccountKind;
  category: CompanyCategory | null;
  /** The verified phone — the server's authorisation for a pre-account call. */
  phone: string;
  /**
   * The name this account is for: the individual's, or the company's. The PAN
   * is verified against it, and the server refuses to open an account under a
   * different one, so changing it upstream invalidates the PAN check.
   */
  accountName: string;
  /**
   * The GST number already typed at the details step. Not re-typed here —
   * it is a first-class field on the form, and asking twice would invite the
   * two to disagree. Empty on a personal account, which has no GST check.
   */
  gstin?: string;
  /** Fires with every proved number, so the parent can gate and prefill. */
  onVerifiedChange: (verified: VerifiedIdentityNumbers) => void;
}

/**
 * Prove the Aadhaar and PAN numbers before either document is uploaded.
 *
 * Aadhaar goes through DigiLocker: the customer opens a consent link in a
 * second tab, signs in with their own Aadhaar and PIN, and shares the document
 * with us. This tab stays alive and polls until that finishes — which is why
 * the link opens in a new tab rather than navigating away, and why nothing
 * typed on the signup form is ever at risk. The customer never types an
 * Aadhaar number at all.
 *
 * PAN goes to the Income Tax Department, which answers with the name the PAN
 * is registered to. GSTIN goes to the GST portal, which answers with the legal
 * name of the business — and unlike the other two its number is not typed
 * here at all, because the form already collected it a step earlier.
 *
 * Nothing here is stored half-done. A number is either proved, in which case
 * the server has a row for it and this shows it back, or it is not, in which
 * case the customer has an error and a button they can press again. See
 * server/cashfreeIdentity.ts.
 */
export function IdentityVerification({
  accountType,
  category,
  phone,
  accountName,
  gstin = '',
  onVerifiedChange,
}: IdentityVerificationProps): React.JSX.Element {
  const checks = requiredIdentityChecks(accountType, category);

  const [pan, setPan] = useState('');
  /** Only ever shown when the server says Aadhaar checking is switched off. */
  const [bypassAadhaar, setBypassAadhaar] = useState('');
  const [aadhaarBypassMode, setAadhaarBypassMode] = useState(false);
  const [waitingOnDigiLocker, setWaitingOnDigiLocker] = useState(false);
  const [busy, setBusy] = useState<'aadhaar' | 'pan' | 'gstin' | null>(null);
  const [errors, setErrors] = useState<Partial<Record<IdentityKind, string>>>({});
  const [verified, setVerified] = useState<Partial<Record<IdentityKind, VerifiedState>>>({});

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAt = useRef(0);

  const stopPolling = useCallback((): void => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    setWaitingOnDigiLocker(false);
  }, []);

  // A journey left running after the step unmounts would keep billing polls
  // against a screen nobody is looking at.
  useEffect(() => stopPolling, [stopPolling]);

  // Reported upward on every change. The parent gates Continue on it and
  // hands the numbers to the documents step, where they become the values
  // OCR compares against.
  const report = useCallback(
    (next: Partial<Record<IdentityKind, VerifiedState>>) => {
      const out: VerifiedIdentityNumbers = {};
      for (const slot of checks) {
        const state = next[KIND_BY_SLOT[slot]];
        if (state) out[slot] = state.documentNo;
      }
      onVerifiedChange(out);
    },
    // `checks` is derived from the two props below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountType, category, onVerifiedChange],
  );

  const settle = useCallback(
    (kind: IdentityKind, state: VerifiedState) => {
      setVerified((prev) => {
        const next = { ...prev, [kind]: state };
        report(next);
        return next;
      });
    },
    [report],
  );

  // Verifications live server-side from the moment they succeed, so stepping
  // back to fix a detail and returning must not cost a second journey.
  useEffect(() => {
    let cancelled = false;
    // Keyed on the phone: a change of number is a different signup, so
    // whatever is on screen from the previous one is cleared first.
    setVerified({});
    setPan('');
    setAadhaarBypassMode(false);
    stopPolling();
    onVerifiedChange({});
    void (async () => {
      try {
        // Named phone, so a browser that has moved on to a different number
        // is not handed what the previous one proved.
        const res = await fetch(
          `/api/signup/identity?phone=${encodeURIComponent(phone)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          verifications: Array<{
            kind: IdentityKind;
            document_no: string;
            status: string;
            verified_name: string | null;
          }>;
        };
        if (cancelled || body.verifications.length === 0) return;
        const next: Partial<Record<IdentityKind, VerifiedState>> = {};
        for (const row of body.verifications) {
          next[row.kind] = {
            documentNo: row.document_no,
            verifiedName: row.verified_name,
            bypassed: row.status === 'bypassed',
          };
          if (row.kind === 'pan') setPan(row.document_no);
        }
        setVerified(next);
        report(next);
      } catch {
        // Offline or a dead session: the fields stay empty and verifying
        // again replaces the rows anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  type ApiError = Error & { failure?: string };

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(path, {
      method,
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
      credentials: 'include',
    });
    // A body we cannot read is never treated as an empty success. The dev
    // server answers an unknown /api path with index.html and a 200 — which,
    // swallowed into {}, reads as "verified with no data" and sends the
    // customer somewhere nonsensical. It means the route is missing, so say so.
    let parsed: Record<string, unknown>;
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new Error(
        res.ok
          ? 'The server did not answer as expected. If you are running locally, restart the dev server.'
          : 'Something went wrong. Please try again.',
      ) as ApiError;
    }

    if (!res.ok) {
      const message =
        typeof parsed.message === 'string'
          ? parsed.message
          : 'Something went wrong. Please try again.';
      const err = new Error(message) as ApiError;
      if (typeof parsed.failure === 'string') err.failure = parsed.failure;
      throw err;
    }
    return parsed;
  }

  /** One poll. Reschedules itself while the answer is still `waiting`. */
  const pollDigiLocker = useCallback(async (): Promise<void> => {
    try {
      const body = await call('GET', '/api/signup/identity/aadhaar/digilocker');
      if (body.state === 'verified') {
        stopPolling();
        settle('aadhaar', {
          documentNo: String(body.document_no ?? ''),
          verifiedName: typeof body.verified_name === 'string' ? body.verified_name : null,
          bypassed: body.bypassed === true,
        });
        setErrors((p) => ({ ...p, aadhaar: '' }));
        return;
      }
      // Still on DigiLocker's site, or Cashfree is still fetching. Say nothing
      // and ask again — a message on every tick would only look like a fault.
      if (Date.now() - pollStartedAt.current > POLL_CEILING_MS) {
        stopPolling();
        setErrors((p) => ({
          ...p,
          aadhaar: 'The DigiLocker link has expired. Please start it again.',
        }));
        return;
      }
      pollTimer.current = setTimeout(() => void pollDigiLocker(), POLL_INTERVAL_MS);
    } catch (err) {
      stopPolling();
      setErrors((p) => ({
        ...p,
        aadhaar: err instanceof Error ? err.message : 'Could not check DigiLocker',
      }));
    }
    // `call`, `settle` and `stopPolling` are stable for the life of the step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settle, stopPolling]);

  async function handleStartDigiLocker(): Promise<void> {
    // Opened synchronously, inside the click, because a popup opened after an
    // await has lost the user gesture and every browser blocks it. The tab is
    // parked on about:blank and pointed at the real URL once we have it.
    const tab = window.open('', '_blank');

    setBusy('aadhaar');
    setErrors((p) => ({ ...p, aadhaar: '' }));
    try {
      const body = await call('POST', '/api/signup/identity/aadhaar/digilocker', { phone });

      // The server says the check is switched off in this environment. There
      // is nothing to consent to, so fall back to a plain field.
      if (body.bypassed === true) {
        tab?.close();
        setAadhaarBypassMode(true);
        return;
      }

      // Only ever an absolute https URL from Cashfree. An empty or relative
      // value assigned to location.href resolves against *this* page, which
      // silently reopens signup in the new tab and looks like DigiLocker
      // failing to load — so it is refused rather than navigated to.
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!url.startsWith('https://')) {
        tab?.close();
        console.error('[identity] DigiLocker URL missing or not absolute:', body.url);
        setErrors((p) => ({
          ...p,
          aadhaar: 'We could not open DigiLocker just now. Please try again in a moment.',
        }));
        return;
      }

      if (tab) {
        tab.location.href = url;
      } else {
        // Popup blocked despite the trick. Navigating this tab away would
        // lose the form, so hand them the link instead.
        setErrors((p) => ({
          ...p,
          aadhaar: 'Your browser blocked the DigiLocker window. Please allow pop-ups and try again.',
        }));
        return;
      }

      pollStartedAt.current = Date.now();
      setWaitingOnDigiLocker(true);
      pollTimer.current = setTimeout(() => void pollDigiLocker(), POLL_INTERVAL_MS);
    } catch (err) {
      tab?.close();
      setErrors((p) => ({
        ...p,
        aadhaar: err instanceof Error ? err.message : 'Could not open DigiLocker',
      }));
    } finally {
      setBusy(null);
    }
  }

  async function handleBypassAadhaar(): Promise<void> {
    if (!/^\d{12}$/.test(bypassAadhaar)) {
      setErrors((p) => ({ ...p, aadhaar: 'Enter a valid 12-digit Aadhaar number' }));
      return;
    }
    setBusy('aadhaar');
    setErrors((p) => ({ ...p, aadhaar: '' }));
    try {
      const body = await call('POST', '/api/signup/identity/aadhaar/bypass', {
        phone,
        aadhaar_number: bypassAadhaar,
      });
      settle('aadhaar', {
        documentNo: String(body.document_no ?? bypassAadhaar),
        verifiedName: null,
        bypassed: true,
      });
    } catch (err) {
      setErrors((p) => ({ ...p, aadhaar: err instanceof Error ? err.message : 'Could not save' }));
    } finally {
      setBusy(null);
    }
  }

  async function handleVerifyGstin(): Promise<void> {
    if (!accountName.trim()) {
      setErrors((p) => ({ ...p, gstin: 'Go back and enter the company name' }));
      return;
    }
    setBusy('gstin');
    setErrors((p) => ({ ...p, gstin: '' }));
    try {
      const body = await call('POST', '/api/signup/identity/gstin', {
        phone,
        gstin,
        name: accountName.trim(),
      });
      settle('gstin', {
        documentNo: String(body.document_no ?? gstin),
        verifiedName: typeof body.verified_name === 'string' ? body.verified_name : null,
        bypassed: body.bypassed === true,
      });
    } catch (err) {
      setErrors((p) => ({
        ...p,
        gstin: err instanceof Error ? err.message : 'Could not verify GST number',
      }));
    } finally {
      setBusy(null);
    }
  }

  async function handleVerifyPan(): Promise<void> {
    if (!DOC_SLOT_SPECS.pan_card.numberField!.pattern.test(pan)) {
      setErrors((p) => ({ ...p, pan: 'Enter a valid 10-character PAN' }));
      return;
    }
    if (!accountName.trim()) {
      setErrors((p) => ({ ...p, pan: 'Go back and enter the name this account is for' }));
      return;
    }
    setBusy('pan');
    setErrors((p) => ({ ...p, pan: '' }));
    try {
      const body = await call('POST', '/api/signup/identity/pan', {
        phone,
        pan,
        name: accountName.trim(),
      });
      settle('pan', {
        documentNo: String(body.document_no ?? pan),
        verifiedName: typeof body.verified_name === 'string' ? body.verified_name : null,
        bypassed: body.bypassed === true,
      });
    } catch (err) {
      setErrors((p) => ({ ...p, pan: err instanceof Error ? err.message : 'Could not verify PAN' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        We check these numbers with the issuing authority before you upload anything, so the
        documents only have to match what is already confirmed.
      </p>

      {checks.map((slot) => {
        const kind = KIND_BY_SLOT[slot];
        const done = verified[kind];

        return (
          <div
            key={slot}
            className={cn(
              'bg-card rounded-xl border p-4 shadow-sm space-y-3',
              done ? 'border-green-300' : 'border-border',
            )}
            data-testid={`identity-${kind}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">
                  {IDENTITY_CHECK_LABELS[slot]} <span className="text-red-400">*</span>
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {kind === 'aadhaar'
                    ? 'Shared from your own DigiLocker — there is no number to type'
                    : kind === 'gstin'
                      ? 'Checked on the GST portal, then matched against your uploaded certificate'
                      : 'Verified against the name registered with the Income Tax Department'}
                </p>
              </div>
              {done ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 bg-green-100 text-green-700">
                  Verified
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 bg-muted text-muted-foreground">
                  Required
                </span>
              )}
            </div>

            {done ? (
              <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="font-mono text-sm text-green-900 tracking-wider">
                    {kind === 'aadhaar' ? maskAadhaar(done.documentNo) : done.documentNo}
                  </span>
                </div>
                {done.verifiedName && (
                  <p className="text-[11px] text-green-800 pl-6">
                    Registered to <span className="font-medium">{done.verifiedName}</span>
                  </p>
                )}
                {done.bypassed && (
                  <p className="text-[11px] text-amber-700 pl-6 inline-flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-[2px] shrink-0" />
                    Verification is switched off in this environment — this number was not checked.
                  </p>
                )}
              </div>
            ) : kind === 'aadhaar' ? (
              aadhaarBypassMode ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    DigiLocker is switched off in this environment. Type the Aadhaar number to
                    continue — it will be stored without being checked.
                  </p>
                  <Input
                    value={formatAadhaar(bypassAadhaar)}
                    onChange={(e) => {
                      setBypassAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12));
                      setErrors((p) => ({ ...p, aadhaar: '' }));
                    }}
                    placeholder="XXXX XXXX XXXX"
                    inputMode="numeric"
                    className="h-11 text-sm bg-muted/30 border-border rounded-xl font-mono tracking-widest"
                    data-testid="identity-aadhaar-number"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleBypassAadhaar()}
                    disabled={bypassAadhaar.length !== 12 || busy !== null}
                    className="h-10 rounded-xl"
                    data-testid="identity-aadhaar-bypass-save"
                  >
                    {busy === 'aadhaar' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
                  </Button>
                </div>
              ) : waitingOnDigiLocker ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 flex items-start gap-2">
                    <Loader2 className="w-4 h-4 text-sky-600 animate-spin mt-[2px] shrink-0" />
                    <div className="space-y-0.5">
                      <p className="text-xs text-sky-900 font-medium">
                        Waiting for DigiLocker…
                      </p>
                      <p className="text-[11px] text-sky-800">
                        Finish signing in and sharing your Aadhaar in the other tab. This page will
                        update on its own — keep it open.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      stopPolling();
                      setErrors((p) => ({ ...p, aadhaar: '' }));
                    }}
                    className="text-[11px] text-muted-foreground underline"
                  >
                    Cancel and start again
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleStartDigiLocker()}
                  disabled={busy !== null}
                  className="h-10 rounded-xl"
                  data-testid="identity-aadhaar-digilocker"
                >
                  {busy === 'aadhaar' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Verify with DigiLocker
                      <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              )
            ) : kind === 'gstin' ? (
              <div className="space-y-3">
                {/* Read-only: the GST number belongs to the details step. */}
                <Input
                  value={gstin}
                  readOnly
                  aria-readonly
                  placeholder="22AAAAA0000A1Z5"
                  className="h-11 text-sm bg-muted/30 border-border rounded-xl font-mono tracking-wider text-muted-foreground"
                  data-testid="identity-gstin-number"
                />
                <p className="text-[11px] text-muted-foreground">
                  Checked against <span className="font-medium">{accountName || '—'}</span>. To
                  change the number, go back a step.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleVerifyGstin()}
                  disabled={gstin.length !== 15 || busy !== null}
                  className="h-10 rounded-xl"
                  data-testid="identity-gstin-verify"
                >
                  {busy === 'gstin' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Verify GST number'
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  value={pan}
                  onChange={(e) => {
                    setPan(
                      e.target.value
                        .replace(/[^A-Za-z0-9]/g, '')
                        .toUpperCase()
                        .slice(0, 10),
                    );
                    setErrors((p) => ({ ...p, pan: '' }));
                  }}
                  placeholder={DOC_SLOT_SPECS.pan_card.numberField!.placeholder}
                  maxLength={10}
                  className="h-11 text-sm bg-muted/30 border-border rounded-xl font-mono tracking-wider"
                  data-testid="identity-pan-number"
                />
                <p className="text-[11px] text-muted-foreground">
                  Checked against <span className="font-medium">{accountName || '—'}</span>.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleVerifyPan()}
                  disabled={pan.length !== 10 || busy !== null}
                  className="h-10 rounded-xl"
                  data-testid="identity-pan-verify"
                >
                  {busy === 'pan' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify PAN'}
                </Button>
              </div>
            )}

            {errors[kind] && (
              <p
                role="alert"
                className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5"
              >
                {errors[kind]}
              </p>
            )}
          </div>
        );
      })}

      <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-[1px] shrink-0" />
        Your Aadhaar is shared by DigiLocker with your consent. We never see your DigiLocker PIN.
      </p>
    </div>
  );
}

/** Grouped as it is printed, so a mistyped digit is easy to spot. */
function formatAadhaar(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/**
 * Only the last four are shown back — the same four a masked e-Aadhaar shows,
 * and often all DigiLocker returned in the first place.
 */
function maskAadhaar(value: string): string {
  return `XXXX XXXX ${value.replace(/\D/g, '').slice(-4)}`;
}
