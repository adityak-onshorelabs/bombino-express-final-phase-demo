export function base64ToPdfFile(base64: string, fileName: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return new File([blob], fileName, { type: 'application/pdf' });
}

export function canSharePdfFile(file: File): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

export function downloadPdfBlob(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export function openPdfOverlayOrDownload(
  base64: string,
  fileName: string,
  overlayTitle: string,
  setPdfTitle: (t: string) => void,
  setPdfDataUrl: (u: string) => void
): void {
  const file = base64ToPdfFile(base64, fileName);
  if (canSharePdfFile(file)) {
    setPdfTitle(overlayTitle);
    setPdfDataUrl(`data:application/pdf;base64,${base64}`);
  } else {
    downloadPdfBlob(file, fileName);
  }
}
