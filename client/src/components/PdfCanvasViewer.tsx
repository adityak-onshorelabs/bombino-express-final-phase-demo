import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
// Local, bundled worker asset (no CDN) for offline / CSP-safe operation.
// Legacy build for wider Android WebView compatibility.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

interface PdfCanvasViewerProps {
  base64: string;
  title?: string;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type RenderStatus = 'loading' | 'ready' | 'error';

export default function PdfCanvasViewer({ base64, title }: PdfCanvasViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<RenderStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    async function run(): Promise<void> {
      const host = hostRef.current;
      if (!host) return;
      setStatus('loading');
      host.innerHTML = '';

      try {
        // Lazy-load the heavy library only on the Android render path.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const data = base64ToUint8Array(base64);
        const task = pdfjs.getDocument({ data });
        loadingTask = task;
        const pdf = await task.promise;
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const containerWidth = host.clientWidth || 1;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = containerWidth / baseViewport.width;
          const viewport = page.getViewport({ scale: fitScale * dpr });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'block bg-white shadow-sm';
          host.appendChild(canvas);

          const renderTask = page.render({ canvas, canvasContext: ctx, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }

        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
        setStatus('error');
      }
    }

    void run();

    return () => {
      cancelled = true;
      for (const task of renderTasks) {
        try {
          task.cancel();
        } catch {
          // ignore cancellation errors
        }
      }
      if (loadingTask) {
        loadingTask.destroy().catch(() => {
          // ignore teardown errors
        });
      }
      const host = hostRef.current;
      if (host) host.innerHTML = '';
    };
  }, [base64]);

  return (
    <div className="relative flex-1 overflow-y-auto bg-neutral-100">
      <div
        ref={hostRef}
        className="flex flex-col items-center gap-3 py-3"
        aria-label={title}
      />
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-100">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t display this PDF. Try the Share option to open it in another app.
          </p>
        </div>
      )}
    </div>
  );
}
