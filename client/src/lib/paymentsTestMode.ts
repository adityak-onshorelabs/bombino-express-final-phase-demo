/**
 * TEMPORARY — client side of the pay-now test bypass.
 *
 * Two separate things, and the difference matters:
 *
 *   `usePaymentsConfig()` — whether the SERVER will accept a bypass at all.
 *                           Nothing here can turn that on.
 *   `useTestModeSkip()`   — whether the tester has asked to skip the gateway.
 *                           A local preference, and only a request: the server
 *                           checks its own flag and 404s if it disagrees.
 *
 * The preference lives in `localStorage` rather than the Zustand store because
 * it is not part of the user's session — it survives a sign-out, it is a
 * property of this browser being a test browser, and it must be deletable in
 * one line when the gateway works.
 *
 * Delete this file, `components/PaymentTestModeSwitch.tsx`, the bypass branch in
 * `lib/razorpay.ts` and the two server endpoints together.
 */

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

const STORAGE_KEY = 'bombino-payments-test-mode';

/** Same-tab listeners. `storage` only fires in OTHER tabs, so it is not enough. */
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode with storage denied. Off is the safe answer.
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Read outside React — `payForOrder` is not a component. */
export function isTestModeSkipOn(): boolean {
  return read();
}

export function setTestModeSkip(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the switch will snap back on the next render, which is
    // an honest reflection of a browser that cannot remember the choice.
  }
  listeners.forEach((listener) => listener());
}

export function useTestModeSkip(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return [on, setTestModeSkip];
}

export interface PaymentsConfig {
  /** Razorpay keys are set on the server. */
  gateway_configured: boolean;
  /** The server will accept `POST /api/payments/test/settle`. */
  test_mode: boolean;
}

/**
 * Asked once per session. This changes when someone edits an env var and
 * restarts the server, so refetching it on every focus would be noise.
 */
export function usePaymentsConfig() {
  return useQuery({
    queryKey: ['/api/payments/config'],
    queryFn: async (): Promise<PaymentsConfig> => {
      const res = await fetch('/api/payments/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not read payment config');
      return (await res.json()) as PaymentsConfig;
    },
    staleTime: Infinity,
    retry: false,
  });
}
