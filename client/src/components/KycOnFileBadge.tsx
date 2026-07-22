import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KycOnFileBadgeProps {
  documentType: string;
  lastFour: string;
  className?: string;
}

export function KycOnFileBadge({
  documentType,
  lastFour,
  className,
}: KycOnFileBadgeProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-sm',
        className,
      )}
      data-testid="kyc-on-file-badge"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-green-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">KYC on file</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {documentType} ••{lastFour}
          </p>
        </div>
      </div>
    </div>
  );
}
