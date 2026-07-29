import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAndroid } from '@/lib/platform';
import type { KycOnFile } from '@/hooks/useKycOnFile';

// Android WebViews will not render a PDF in an iframe — same split used for AWB labels.
// The chunk pulls in pdfjs-dist; if that fails to load, degrade to the open-in-new-tab
// link rather than taking the whole page down.
const PdfCanvasViewer = lazy(() =>
  import('@/components/PdfCanvasViewer').catch(() => ({
    default: (_props: { base64: string; title?: string }) => (
      <div className="p-3 text-xs text-muted-foreground">
        Inline preview unavailable on this device — use “Open full size” below.
      </div>
    ),
  })),
);

interface KycOnFileCardProps {
  kyc: KycOnFile;
  /** Open the document preview as soon as the card mounts. */
  defaultOpen?: boolean;
  className?: string;
}

function formatFileSize(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedAt(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read your document.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });
}

function DetailRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="text-xs text-foreground font-medium truncate mt-0.5" title={value}>
        {value}
      </p>
    </div>
  );
}

export function KycOnFileCard({
  kyc,
  defaultOpen = false,
  className,
}: KycOnFileCardProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [blobMime, setBlobMime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Falls back to the fetched blob's own type when the summary carries no metadata.
  const mimeType = kyc.mime_type ?? blobMime;
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const useCanvasPdf = isPdf && isAndroid();

  // Re-fetch whenever the stored document changes (updated_at moves on re-upload).
  useEffect(() => {
    if (!open) return;
    let revoked = false;
    let url: string | null = null;

    setLoading(true);
    setError('');
    void (async () => {
      try {
        const res = await fetch('/api/kyc/me/file', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Could not load your document.');
        const blob = await res.blob();
        if (revoked) return;
        setBlobMime(blob.type);
        if ((kyc.mime_type ?? blob.type) === 'application/pdf' && isAndroid()) {
          const base64 = await blobToBase64(blob);
          if (revoked) return;
          setPdfBase64(base64);
        }
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch (err) {
        if (!revoked) {
          setError(err instanceof Error ? err.message : 'Could not load your document.');
        }
      } finally {
        if (!revoked) setLoading(false);
      }
    })();

    return () => {
      revoked = true;
      setObjectUrl(null);
      setPdfBase64(null);
      setBlobMime('');
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, kyc.updated_at, kyc.mime_type]);

  return (
    <div
      className={cn(
        'rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-sm space-y-3',
        className,
      )}
      data-testid="kyc-on-file-badge"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-green-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">KYC on file</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kyc.document_type} ••{kyc.last_four}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary shrink-0"
          aria-expanded={open}
          data-testid="button-kyc-preview-toggle"
        >
          {open ? 'Hide' : 'Preview'}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-green-200/70 pt-3">
        <DetailRow label="Document type" value={kyc.document_type} />
        <DetailRow label="Number" value={`•••• ${kyc.last_four}`} />
        <DetailRow label="File" value={kyc.original_filename || '—'} />
        <DetailRow
          label="Uploaded"
          value={`${formatUploadedAt(kyc.updated_at)} · ${formatFileSize(kyc.file_size_bytes)}`}
        />
      </div>

      {open && (
        <div className="border-t border-green-200/70 pt-3" data-testid="kyc-preview">
          {loading && (
            <div className="flex items-center justify-center gap-2 h-32 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading document…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && objectUrl && (
            <div className="space-y-2">
              {isImage && (
                <img
                  src={objectUrl}
                  alt={`${kyc.document_type} document`}
                  className="w-full max-h-64 object-contain rounded-lg border border-border bg-white"
                  data-testid="img-kyc-preview"
                />
              )}

              {isPdf && useCanvasPdf && pdfBase64 && (
                <Suspense
                  fallback={
                    <div className="h-64 grid place-items-center text-xs text-muted-foreground">
                      Loading PDF…
                    </div>
                  }
                >
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-white">
                    <PdfCanvasViewer
                      base64={pdfBase64}
                      title={`${kyc.document_type} document`}
                    />
                  </div>
                </Suspense>
              )}

              {isPdf && !useCanvasPdf && (
                <iframe
                  src={objectUrl}
                  title={`${kyc.document_type} document`}
                  className="w-full h-64 rounded-lg border border-border bg-white"
                  data-testid="iframe-kyc-preview"
                />
              )}

              {!isImage && !isPdf && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-white p-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground truncate">
                    {kyc.original_filename || 'Document ready to open'}
                  </p>
                </div>
              )}

              <a
                href={objectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
                data-testid="link-kyc-open-full"
              >
                {isImage ? <ImageIcon className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                Open full size
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
