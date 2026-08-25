import React from 'react';
import { Link } from 'wouter';
import { ScrollText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CONTRACT_CLAUSES,
  CONTRACT_TITLE,
  CONTRACT_VERSION,
  SIGNATURE_MAX_LENGTH,
  isValidSignature,
} from '@shared/contract';
import { cn } from '@/lib/utils';

interface ContractSignatureProps {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  signedName: string;
  onSignedNameChange: (name: string) => void;
  /** Set after a blocked submit, so the gaps are marked rather than hunted for. */
  error?: string;
}

/**
 * The contract, and the signature that closes signup.
 *
 * Signing is typing: the customer ticks acceptance and types their name, and
 * that name is what stands on the contract. The server stamps it with
 * CONTRACT_VERSION, so an acceptance stays readable later as the text that
 * was actually on screen.
 */
export function ContractSignature({
  accepted,
  onAcceptedChange,
  signedName,
  onSignedNameChange,
  error,
}: ContractSignatureProps): React.JSX.Element {
  const signatureValid = isValidSignature(signedName);
  const signedOn = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className={cn(
        'bg-card rounded-xl border p-4 shadow-sm space-y-3',
        error ? 'border-primary border-2' : 'border-border',
      )}
      data-testid="contract-signature"
    >
      <div className="flex items-start gap-2">
        <ScrollText className="w-5 h-5 text-[#F2A123] shrink-0 mt-0.5" />
        <div>
          <Label className="text-sm font-semibold">{CONTRACT_TITLE}</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Version {CONTRACT_VERSION} · read before you sign
          </p>
        </div>
      </div>

      {/* Scrolls inside itself: the contract must be readable in full without
          pushing the signature off the bottom of a phone screen. */}
      <div
        className="max-h-56 overflow-y-auto rounded-lg bg-muted/40 border border-border p-3 space-y-3 text-xs leading-relaxed text-muted-foreground"
        tabIndex={0}
        role="region"
        aria-label="Contract terms"
        data-testid="contract-terms"
      >
        {CONTRACT_CLAUSES.map((clause) => (
          <section key={clause.heading}>
            <h3 className="font-semibold text-foreground text-[11px] uppercase tracking-wide mb-1">
              {clause.heading}
            </h3>
            <p>{clause.body}</p>
          </section>
        ))}
        <p className="pt-1 border-t border-border">
          Personal data is handled as described in our{' '}
          <Link href="/privacy" className="text-[#F2A123] underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <Checkbox
          checked={accepted}
          onCheckedChange={(v) => onAcceptedChange(v === true)}
          className="mt-0.5"
          data-testid="checkbox-accept-contract"
        />
        <span className="text-xs text-foreground leading-snug">
          I have read and agree to the {CONTRACT_TITLE}, and I am authorised to sign it for this
          account.
        </span>
      </label>

      <div>
        <Label className="text-xs text-muted-foreground">
          Signature <span className="text-red-400">*</span>
        </Label>
        <Input
          value={signedName}
          onChange={(e) => onSignedNameChange(e.target.value.slice(0, SIGNATURE_MAX_LENGTH))}
          placeholder="Type your full name"
          maxLength={SIGNATURE_MAX_LENGTH}
          autoComplete="name"
          className="h-11 mt-1 text-sm bg-muted/30 border-border rounded-xl"
          data-testid="input-contract-signature"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Typing your name here signs the contract, the same as signing it by hand.
        </p>
      </div>

      {/* The signature as it will stand on the contract — what they typed,
          dated, so it reads as a signature rather than one more form field. */}
      <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
        <p
          className={cn(
            'text-lg italic leading-tight break-all',
            signatureValid && accepted ? 'text-foreground' : 'text-muted-foreground/50',
          )}
          style={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive' }}
          data-testid="contract-signature-preview"
        >
          {signedName.trim() || 'Your name'}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">Signed on {signedOn}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
