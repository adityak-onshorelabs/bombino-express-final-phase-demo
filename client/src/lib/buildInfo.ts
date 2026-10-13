/**
 * Which build of the app is running, so a screenshot from any phone says
 * exactly what code it came from. Every deploy is logged in docs/builds/.
 *
 *   version  package.json's "version", bumped by hand for a release
 *   commit   the git commit the bundle was built from (Railway's, or local git)
 *   builtAt  when the bundle was built
 *
 * The values are replaced at build time by Vite's `define` (vite.config.ts).
 *
 * The iOS and Android apps are shells that load this site (server.url), so
 * the web build above is what changes on every deploy. The shell has its own
 * store version, read from Capacitor's App plugin when the shell includes it.
 */

import { isCapacitorNative } from '@/lib/platform';

declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_COMMIT: string = __BUILD_COMMIT__;
export const BUILD_TIME: string = __BUILD_TIME__;

/** "13 Oct 2026", in India time, where the team reads it. */
export function buildDateLabel(): string {
  const date = new Date(BUILD_TIME);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** "v1.0.0 · 3d0ac14 · 13 Oct 2026" */
export function webBuildLabel(): string {
  return [`v${APP_VERSION}`, BUILD_COMMIT, buildDateLabel()].filter(Boolean).join(' · ');
}

interface AppInfo {
  version?: string;
  build?: string;
}

/**
 * The native shell's store version, e.g. "iOS 1.2 (5)", or null on the web
 * or when the shell does not include the App plugin.
 */
export async function nativeShellLabel(): Promise<string | null> {
  if (!isCapacitorNative()) return null;
  const cap = (window as unknown as {
    Capacitor?: {
      getPlatform?: () => string;
      Plugins?: { App?: { getInfo?: () => Promise<AppInfo> } };
    };
  }).Capacitor;
  const getInfo = cap?.Plugins?.App?.getInfo;
  if (!getInfo) return null;
  try {
    const info = await getInfo();
    if (!info.version) return null;
    const platform = cap?.getPlatform?.() === 'ios' ? 'iOS' : 'Android';
    return `${platform} ${info.version}${info.build ? ` (${info.build})` : ''}`;
  } catch {
    return null;
  }
}
