import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CloudUpload,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  DOC_SLOT_SPECS,
  isVerifiedDocSlot,
  requiredDocuments,
  type AccountKind,
  type CompanyCategory,
  type DocSlot,
} from '@shared/accountSpec';
import { cn } from '@/lib/utils';

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type SlotStatus = 'idle' | 'pending' | 'uploading' | 'success' | 'unverified' | 'error';

interface SlotState {
  status: SlotStatus;
  documentNo: string;
  fileName: string;
  error: string;
  /**
   * Why the document is not verified, when it is not. A contradicting number,
   * the wrong document or a tamper signal never gets this far — the server
   * refuses those uploads outright. What lands here is an unreadable scan or
   * an unreachable verifier, and account creation refuses both, so the slot
   * stays outstanding rather than showing as done.
   */
  ocrNote: string;
}

const EMPTY_SLOT: SlotState = {
  status: 'idle',
  documentNo: '',
  fileName: '',
  error: '',
  ocrNote: '',
};

/**
 * The OCR outcomes the server will open an account on.
 *
 * `bypassed` is OCR_BYPASS=1 on the server: the document was stored without
 * being checked at all, on purpose, because there is no Cashfree production
 * account yet. Leaving it out here would gate Continue on a verdict that is
 * never coming.
 */
const OCR_ACCEPTED = new Set(['match', 'bypassed']);

/**
 * Whether a slot counts as done.
 *
 * Deliberately the same rule the server applies in assertDocumentsStaged: a
 * slot nothing checks is always fine, and one that is checked must have come
 * back `match` — or `bypassed`, which is the server saying it was told not to
 * look. Anything else — unreadable, unavailable, or a row from before any of
 * this existed with no status at all — leaves the slot outstanding, because
 * the server will refuse to open an account on it.
 *
 * Keyed on isVerifiedDocSlot rather than isOcrCheckedSlot so the GST
 * certificate counts: Cashfree has no OCR type for one, but it is read all the
 * same (server/gstCertificate.ts) and the server gates on it.
 */
function isSlotVerified(slot: string, ocrStatus: string | null | undefined): boolean {
  if (!isVerifiedDocSlot(slot)) return true;
  return OCR_ACCEPTED.has(ocrStatus ?? '');
}

interface AccountDocumentsProps {
  accountType: AccountKind;
  category: CompanyCategory | null;
  /** The verified number — the server's authorisation for a pre-account upload. */
  phone: string;
  /** Fires with the slots still outstanding, so the parent can gate its button. */
  onMissingChange: (missing: DocSlot[]) => void;
  /** Slots the parent wants marked, after a blocked submit. */
  highlight?: readonly DocSlot[];
  /**
   * The numbers an authority already confirmed at the identity step, keyed by
   * slot. These fields are shown read-only: the customer has proved this
   * Aadhaar and this PAN, and the only question left is whether the document
   * they upload carries them. The server ignores whatever `document_no` an
   * upload sends for these slots and substitutes the proved value, so this is
   * presentation of a decision already made rather than the decision itself.
   */
  verifiedNumbers?: Partial<Record<DocSlot, string>>;
}

/**
 * The compelled document set for one account shape.
 *
 * Uploads land before the account exists — they are staged server-side
 * against the session and claimed at creation — so nothing here needs a login.
 * The slot list comes from `shared/accountSpec.ts`, the same file the server
 * validates against, so the form cannot ask for less than the server demands.
 */
export function AccountDocuments({
  accountType,
  category,
  phone,
  onMissingChange,
  highlight,
  verifiedNumbers,
}: AccountDocumentsProps): React.JSX.Element {
  const slots = requiredDocuments(accountType, category);
  const [state, setState] = useState<Record<string, SlotState>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  /** A file chosen before its number was valid; uploaded as soon as it is. */
  const pendingFiles = useRef<Record<string, File | null>>({});

  const getSlot = useCallback(
    (slot: DocSlot): SlotState => {
      const current = state[slot] ?? EMPTY_SLOT;
      const proved = verifiedNumbers?.[slot];
      // The proved number wins over anything held locally: it is the value the
      // server will compare against regardless of what this component thinks.
      return proved ? { ...current, documentNo: proved } : current;
    },
    [state, verifiedNumbers],
  );

  const patchSlot = useCallback((slot: DocSlot, patch: Partial<SlotState>): void => {
    setState((prev) => ({ ...prev, [slot]: { ...(prev[slot] ?? EMPTY_SLOT), ...patch } }));
  }, []);

  // Documents live server-side from the moment they upload, so stepping back
  // to fix a detail and returning must not read as "nothing uploaded" and
  // make the customer find the files again.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/signup/documents', { credentials: 'include' });
        if (!res.ok) return;
        const body = (await res.json()) as {
          documents: Array<{
            doc_slot: string;
            document_no: string | null;
            original_filename: string;
            ocr_status: string | null;
          }>;
        };
        if (cancelled) return;
        setState((prev) => {
          const next = { ...prev };
          for (const doc of body.documents) {
            // A slot already being worked on locally wins — the in-flight
            // upload is newer than whatever this response describes.
            if (next[doc.doc_slot]?.status === 'uploading') continue;
            const verified = isSlotVerified(doc.doc_slot, doc.ocr_status);
            next[doc.doc_slot] = {
              ...(next[doc.doc_slot] ?? EMPTY_SLOT),
              status: verified ? 'success' : 'unverified',
              documentNo: doc.document_no ?? '',
              fileName: doc.original_filename,
              error: '',
              ocrNote: verified
                ? ''
                : 'This document could not be verified. Please upload it again.',
            };
          }
          return next;
        });
      } catch {
        // Offline or a dead session: the slots stay empty and re-uploading
        // replaces the rows anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Report upward on every change. The parent gates "create account" on this,
  // and the server refuses the same set independently.
  useEffect(() => {
    // 'unverified' deliberately does not count as complete: the server refuses
    // to open an account on a document OCR never read, so letting Continue
    // through here would only fail two screens later.
    onMissingChange(slots.filter((slot) => (state[slot]?.status ?? 'idle') !== 'success'));
    // `slots` is derived from the two props above, so it changes with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, accountType, category]);

  /**
   * Whether this slot's number is good enough to upload against.
   *
   * A slot whose number was proved at the identity step is always ready, and
   * is deliberately not pattern-tested: DigiLocker returns the Aadhaar masked
   * (`XXXXXXXX1234`), which cannot match the twelve-digit pattern the form
   * uses for a typed one. Testing it would park every Aadhaar upload in
   * `pending` forever, since the field is read-only and can never be corrected
   * into shape. The server owns this value and re-supplies it on upload, so
   * there is nothing here left to validate.
   */
  const isNumberValid = (slot: DocSlot, value: string): boolean => {
    if (verifiedNumbers?.[slot] !== undefined) return true;
    const field = DOC_SLOT_SPECS[slot].numberField;
    if (!field) return true;
    return field.pattern.test(value);
  };

  async function performUpload(slot: DocSlot, file: File, documentNo: string): Promise<void> {
    patchSlot(slot, { status: 'uploading', fileName: file.name, error: '', ocrNote: '' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_slot', slot);
    formData.append('phone', phone);
    if (documentNo) formData.append('document_no', documentNo);

    try {
      const res = await fetch('/api/signup/documents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: 'Upload failed.' }))) as {
          message: string;
        };
        throw new Error(body.message);
      }
      const body = (await res.json().catch(() => ({}))) as {
        ocr?: { status?: string; message?: string };
      };
      const verified = isSlotVerified(slot, body.ocr?.status);
      patchSlot(slot, {
        status: verified ? 'success' : 'unverified',
        fileName: file.name,
        error: '',
        ocrNote: verified ? '' : (body.ocr?.message ?? 'This document could not be verified.'),
      });
      pendingFiles.current[slot] = null;
    } catch (err) {
      patchSlot(slot, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
    }
  }

  function handleNumberChange(slot: DocSlot, raw: string): void {
    // `readOnly` already stops the keystroke, but a locked slot's value is the
    // server's, and letting anything at all rewrite it here would put the
    // field and the upload out of step.
    if (verifiedNumbers?.[slot] !== undefined) return;
    const field = DOC_SLOT_SPECS[slot].numberField;
    if (!field) return;

    const stripped = raw.replace(field.uppercase ? /[^A-Za-z0-9]/g : /\D/g, '');
    const value = (field.uppercase ? stripped.toUpperCase() : stripped).slice(0, field.maxLength);
    const current = getSlot(slot);

    if (!field.pattern.test(value)) {
      // A number that no longer matches invalidates the upload it was sent
      // with — the server holds the old pair, so the slot is not "done".
      patchSlot(slot, {
        documentNo: value,
        status: pendingFiles.current[slot] ? 'pending' : 'idle',
        fileName: pendingFiles.current[slot] ? current.fileName : '',
        error: '',
      });
      return;
    }

    const waiting = pendingFiles.current[slot];
    if (waiting) {
      pendingFiles.current[slot] = null;
      patchSlot(slot, { documentNo: value });
      void performUpload(slot, waiting, value);
      return;
    }

    patchSlot(slot, { documentNo: value });
  }

  async function handleFile(slot: DocSlot, file: File): Promise<void> {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      patchSlot(slot, { status: 'error', error: 'Only PDF, JPEG, or PNG files are accepted.' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      patchSlot(slot, { status: 'error', error: 'File must be under 5MB.' });
      return;
    }

    const { documentNo } = getSlot(slot);
    if (!isNumberValid(slot, documentNo)) {
      pendingFiles.current[slot] = file;
      patchSlot(slot, { status: 'pending', fileName: file.name, error: '' });
      return;
    }
    await performUpload(slot, file, documentNo);
  }

  async function handleRemove(slot: DocSlot): Promise<void> {
    pendingFiles.current[slot] = null;
    patchSlot(slot, { status: 'idle', fileName: '', error: '' });
    try {
      await fetch(`/api/signup/documents/${slot}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      // The slot is already cleared locally, and re-uploading replaces the row
      // server-side, so a failed delete costs nothing the customer can see.
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {slots.length} document{slots.length === 1 ? '' : 's'} required. PDF, JPEG, or PNG · max 5MB
        each.
      </p>

      {slots.map((slot) => {
        const spec = DOC_SLOT_SPECS[slot];
        const s = getSlot(slot);
        const locked = verifiedNumbers?.[slot] !== undefined;
        const flagged = highlight?.includes(slot) && s.status !== 'success';

        return (
          <div
            key={slot}
            className={cn(
              'bg-card rounded-xl border p-4 shadow-sm space-y-3',
              flagged ? 'border-primary border-2 field-shake' : 'border-border',
            )}
            data-testid={`doc-slot-${slot}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">
                  {spec.label} <span className="text-red-400">*</span>
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">{spec.hint}</p>
              </div>
              <StatusPill status={s.status} />
            </div>

            {spec.numberField && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  {spec.numberField.label} <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={s.documentNo}
                  onChange={(e) => handleNumberChange(slot, e.target.value)}
                  placeholder={spec.numberField.placeholder}
                  maxLength={spec.numberField.maxLength}
                  inputMode={spec.numberField.uppercase ? 'text' : 'numeric'}
                  readOnly={locked}
                  aria-readonly={locked}
                  className={cn(
                    'h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl',
                    !spec.numberField.uppercase && 'font-mono tracking-widest',
                    locked && 'text-muted-foreground cursor-not-allowed',
                  )}
                  data-testid={`doc-number-${slot}`}
                />
                {locked && (
                  <p className="text-[10px] text-green-700 mt-1 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Already verified — upload the matching
                    document.
                  </p>
                )}
              </div>
            )}

            <input
              ref={(el) => {
                fileInputs.current[slot] = el;
              }}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(slot, file);
                e.target.value = '';
              }}
              data-testid={`doc-file-${slot}`}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputs.current[slot]?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputs.current[slot]?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(slot, file);
              }}
              className={cn(
                'border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[84px] select-none',
                s.status === 'idle' && 'border-border hover:border-primary/50 hover:bg-primary/5',
                s.status === 'pending' && 'border-sky-300 bg-sky-50/50',
                s.status === 'unverified' && 'border-amber-400 bg-amber-50',
                s.status === 'uploading' && 'border-amber-300 bg-amber-50 pointer-events-none',
                s.status === 'success' && 'border-green-300 bg-green-50',
                s.status === 'error' && 'border-red-300 bg-red-50',
              )}
            >
              {s.status === 'idle' && (
                <>
                  <CloudUpload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Tap to upload or drag &amp; drop</p>
                </>
              )}

              {s.status === 'pending' && (
                <>
                  <FileText className="w-6 h-6 text-sky-600" />
                  <p className="text-xs text-sky-900 font-medium truncate max-w-[200px]">
                    {s.fileName}
                  </p>
                  <p className="text-[10px] text-muted-foreground text-center px-1">
                    Enter a valid {spec.numberField?.label} to upload
                  </p>
                </>
              )}

              {s.status === 'uploading' && (
                <>
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                  <p className="text-xs text-amber-700 font-medium truncate max-w-[200px]">
                    {s.fileName}
                  </p>
                </>
              )}

              {s.status === 'success' && (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="text-xs text-green-700 font-medium truncate max-w-[200px]">
                    {s.fileName}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputs.current[slot]?.click();
                      }}
                      className="text-[11px] text-primary underline"
                    >
                      Change file
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemove(slot);
                      }}
                      className="text-[11px] text-muted-foreground underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </>
              )}

              {s.status === 'unverified' && (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <p className="text-xs text-amber-800 font-medium truncate max-w-[200px]">
                    {s.fileName}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputs.current[slot]?.click();
                    }}
                    className="text-[11px] text-primary underline"
                  >
                    Upload a clearer photo
                  </button>
                </>
              )}

              {s.status === 'error' && (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  <p className="text-xs text-red-600 text-center px-2">{s.error}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputs.current[slot]?.click();
                    }}
                    className="text-[11px] text-primary underline"
                  >
                    Try again
                  </button>
                </>
              )}
            </div>

            {s.status === 'unverified' && s.ocrNote && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                {s.ocrNote}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: SlotStatus }): React.JSX.Element {
  const config: Record<SlotStatus, { label: string; className: string }> = {
    idle: { label: 'Required', className: 'bg-muted text-muted-foreground' },
    pending: { label: 'Selected', className: 'bg-sky-100 text-sky-800' },
    uploading: { label: 'Checking…', className: 'bg-amber-100 text-amber-700' },
    // "Verified", not "Uploaded" — the document was read and it agreed.
    success: { label: 'Verified', className: 'bg-green-100 text-green-700' },
    unverified: { label: 'Not verified', className: 'bg-amber-100 text-amber-800' },
    error: { label: 'Failed', className: 'bg-red-100 text-red-600' },
  };
  const { label, className } = config[status];
  return (
    <span
      className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0', className)}
    >
      {label}
    </span>
  );
}
