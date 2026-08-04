/**
 * Bombino's payment QR, rendered at the doorstep.
 *
 * The amount is encoded into the UPI URI rather than typed by the customer:
 * an agent standing in the street cannot audit what someone punched into their
 * own banking app, and a mistyped amount surfaces as a reconciliation problem
 * days later. Scanning a pre-filled intent removes that class of error.
 *
 * The QR is generated on the device, not fetched — a low-end phone on bad
 * network must not be waiting on an image request while a customer stands
 * there with their app open.
 *
 * IMPORTANT: this encodes a real payment destination. The VPA comes from the
 * server (`GET /api/payment/upi`, backed by `BOMBINO_UPI_VPA`) and is never
 * defaulted or guessed here — no VPA means no QR, and the component renders
 * nothing.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2 } from 'lucide-react';

export interface UpiPayee {
  vpa: string;
  payeeName: string;
}

/**
 * Build a UPI intent URI.
 *
 * `tr` (transaction reference) carries the order number so a payment can be
 * matched back to an order from the bank statement alone, without relying on
 * the agent having recorded it.
 */
export function buildUpiUri({
  payee,
  amount,
  orderNo,
}: {
  payee: UpiPayee;
  amount: number;
  orderNo: string;
}): string {
  const params = new URLSearchParams({
    pa: payee.vpa,
    pn: payee.payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Bombino ${orderNo}`,
    tr: orderNo,
  });
  // URLSearchParams serialises a space as "+" (form encoding). UPI is a plain
  // URI scheme, not a form post, and PSP apps that parse it naively show the
  // payee as "Bombino+Express". %20 is read correctly by every app.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

export function UpiQr({
  payee,
  amount,
  orderNo,
}: {
  payee: UpiPayee;
  amount: number;
  orderNo: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDataUrl(null);

    // A zero or negative amount would encode an intent the customer's app
    // rejects — show nothing rather than an unscannable square.
    if (!Number.isFinite(amount) || amount <= 0) {
      setFailed(true);
      return;
    }

    QRCode.toDataURL(buildUpiUri({ payee, amount, orderNo }), {
      // High correction: the screen will be scanned in sunlight, at an angle,
      // possibly with a cracked or greasy display in the way.
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 512,
      color: { dark: '#1B2A41', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [payee, amount, orderNo]);

  if (failed) {
    return (
      <div
        className="rounded-xl border-2 border-border bg-white px-4 py-3 mb-3"
        data-testid="upi-qr-failed"
      >
        <p className="text-sm font-bold text-foreground">QR unavailable</p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">
          Take the transfer to {payee.vpa} and enter the amount below.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border-2 border-border bg-white p-4 mb-3 flex flex-col items-center"
      data-testid="upi-qr"
    >
      <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground self-start">
        Customer scans this
      </p>

      <div className="mt-3 w-[184px] h-[184px] grid place-items-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`UPI payment QR for ${orderNo}`}
            className="w-full h-full"
            width={184}
            height={184}
          />
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* The amount is restated under the code because it is encoded inside it
          — the agent needs to be able to confirm out loud what the customer's
          app is about to show them. */}
      <p className="mt-3 text-2xl font-extrabold tabular-nums text-foreground leading-none">
        ₹{amount.toFixed(2)}
      </p>
      <p className="mt-1 font-mono text-xs font-semibold text-muted-foreground">
        {payee.vpa}
      </p>
    </div>
  );
}
