import React, { useState, useRef } from 'react';
import { CloudUpload, CheckCircle2, XCircle, Loader2, FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface KycUploadResult {
  document_type: string;
  document_no: string;
  document_id: string;
  file_path: string;
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface KycUploadProps {
  onValidChange: (result: KycUploadResult | null) => void;
  fieldErrors?: {
    document_no?: boolean;
    file?: boolean;
  };
}

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function StatusPill({ status }: { status: UploadStatus }) {
  const config: Record<UploadStatus, { label: string; className: string }> = {
    idle:      { label: 'Required',   className: 'bg-muted text-muted-foreground' },
    uploading: { label: 'Uploading…', className: 'bg-amber-100 text-amber-700' },
    success:   { label: 'Uploaded',   className: 'bg-green-100 text-green-700' },
    error:     { label: 'Failed',     className: 'bg-red-100 text-red-600' },
  };
  const { label, className } = config[status];
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', className)}>
      {label}
    </span>
  );
}

export function KycUpload({ onValidChange, fieldErrors }: KycUploadProps): React.JSX.Element {
  const [docType, setDocType] = useState('Aadhaar Number');
  const [aadhaarRaw, setAadhaarRaw] = useState('');
  const [aadhaarDisplay, setAadhaarDisplay] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState<{ id: string; file_path: string } | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function syncToParent(
    dt: string,
    digits: string,
    result: { id: string; file_path: string } | null,
  ): void {
    if (/^\d{12}$/.test(digits) && result) {
      onValidChange({
        document_type: dt,
        document_no: digits,
        document_id: result.id,
        file_path: result.file_path,
      });
    } else {
      onValidChange(null);
    }
  }

  function handleAadhaarChange(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    setAadhaarRaw(digits);
    // Format as XXXX-XXXX-XXXX
    let formatted = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 === 0) formatted += '-';
      formatted += digits[i];
    }
    setAadhaarDisplay(formatted);
    syncToParent(docType, digits, uploadResult);
  }

  function handleDocTypeChange(value: string): void {
    setDocType(value);
    syncToParent(value, aadhaarRaw, uploadResult);
  }

  async function handleFileSelect(file: File): Promise<void> {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setUploadError('Only PDF, JPEG, or PNG files are accepted.');
      setUploadStatus('error');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File must be under 5MB.');
      setUploadStatus('error');
      return;
    }

    setSelectedFileName(file.name);
    setUploadStatus('uploading');
    setUploadError('');
    setUploadResult(null);
    syncToParent(docType, aadhaarRaw, null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', docType);
    formData.append('document_no', aadhaarRaw);

    try {
      const res = await fetch('/api/kyc/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Upload failed.' })) as { message: string };
        throw new Error(body.message);
      }

      const data = await res.json() as { id: string; file_path: string };
      setUploadResult(data);
      setUploadStatus('success');
      syncToParent(docType, aadhaarRaw, data);
    } catch (err) {
      setUploadStatus('error');
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) void handleFileSelect(file);
  }

  const showAadhaarError = fieldErrors?.document_no && !/^\d{12}$/.test(aadhaarRaw);
  const showFileError = fieldErrors?.file && uploadStatus !== 'success';

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">KYC Details</Label>
        <span className="text-[10px] text-muted-foreground">Required for Indian customs</span>
      </div>

      {/* Document Type */}
      <div>
        <Label className="text-xs text-muted-foreground">
          Document Type <span className="text-red-400">*</span>
        </Label>
        <Select value={docType} onValueChange={handleDocTypeChange}>
          <SelectTrigger className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Aadhaar Number">Aadhaar Card</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Aadhaar Number */}
      <div>
        <Label className="text-xs text-muted-foreground">
          Aadhaar Number <span className="text-red-400">*</span>
        </Label>
        <Input
          value={aadhaarDisplay}
          onChange={(e) => handleAadhaarChange(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          maxLength={14}
          inputMode="numeric"
          className={cn(
            'h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl font-mono tracking-widest',
            showAadhaarError && 'border-2 border-primary',
          )}
          data-testid="input-aadhaar-number"
        />
        {aadhaarRaw.length > 0 && aadhaarRaw.length < 12 && (
          <p className="text-xs text-muted-foreground mt-1">
            {12 - aadhaarRaw.length} more digit{12 - aadhaarRaw.length !== 1 ? 's' : ''} required
          </p>
        )}
        {showAadhaarError && (
          <p className="text-xs text-red-600 mt-1">Valid 12-digit Aadhaar number required</p>
        )}
      </div>

      {/* File Upload */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs text-muted-foreground">
            Aadhaar Document <span className="text-red-400">*</span>
          </Label>
          <StatusPill status={uploadStatus} />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelect(file);
            e.target.value = '';
          }}
          data-testid="input-kyc-file"
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors min-h-[96px] select-none',
            uploadStatus === 'idle'      && 'border-border hover:border-primary/50 hover:bg-primary/5',
            uploadStatus === 'uploading' && 'border-amber-300 bg-amber-50 pointer-events-none',
            uploadStatus === 'success'   && 'border-green-300 bg-green-50',
            uploadStatus === 'error'     && 'border-red-300 bg-red-50',
            showFileError && uploadStatus === 'idle' && 'border-primary',
          )}
        >
          {uploadStatus === 'idle' && (
            <>
              <CloudUpload className="w-7 h-7 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center leading-tight">
                Tap to upload or drag & drop
              </p>
            </>
          )}

          {uploadStatus === 'uploading' && (
            <>
              <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
              <p className="text-xs text-amber-700 font-medium truncate max-w-[200px]">
                {selectedFileName}
              </p>
            </>
          )}

          {uploadStatus === 'success' && (
            <>
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div className="text-center">
                <p className="text-xs text-green-700 font-medium truncate max-w-[200px]">
                  {selectedFileName}
                </p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="text-[11px] text-primary underline mt-0.5"
                >
                  Change file
                </button>
              </div>
            </>
          )}

          {uploadStatus === 'error' && (
            <>
              <XCircle className="w-6 h-6 text-red-500" />
              <p className="text-xs text-red-600 text-center leading-tight px-2">
                {uploadError}
              </p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="text-[11px] text-primary underline"
              >
                Try again
              </button>
            </>
          )}
        </div>

        {showFileError && (
          <p className="text-xs text-red-600 mt-1">Please upload your Aadhaar document</p>
        )}
        <div className="flex items-center gap-1 mt-1.5">
          <FileText className="w-3 h-3 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">PDF, JPEG, or PNG · Max 5MB</p>
        </div>
      </div>
    </div>
  );
}
