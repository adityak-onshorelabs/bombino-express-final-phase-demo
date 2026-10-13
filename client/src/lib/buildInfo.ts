/**
 * Which build of the app is running, so a screenshot from any phone says
 * exactly what code it came from. Every deploy is logged in docs/builds/.
 *
 *   "v26.10.13 #2"  the 2nd deploy on 13 Oct 2026, from build.json, which
 *                   `npm run build:next` bumps before each deploy
 *   commit          the git commit the bundle was built from (Railway's, or
 *                   local git); kept out of the label, in its title and data-commit
 *
 * The values are replaced at build time by Vite's `define` (vite.config.ts).
 *
 * The iOS and Android apps are shells that load this site (server.url), so
 * the web build above is what changes on every deploy. The shell has its own
 * store version, read from Capacitor's App plugin when the shell includes it.
 */

import { isCapacitorNative } from '@/lib/platform';

declare const __BUILD_DATE__: string;
declare const __BUILD_NUMBER__: number;
declare const __BUILD_COMMIT__: string;

export const BUILD_DATE: string = __BUILD_DATE__;
export const BUILD_NUMBER: number = __BUILD_NUMBER__;
export const BUILD_COMMIT: string = __BUILD_COMMIT__;

/** "v26.10.13 #2" */
export function webBuildLabel(): string {
  const [year = '', month = '', day = ''] = BUILD_DATE.split('-');
  return `v${year.slice(2)}.${month}.${day} #${BUILD_NUMBER}`;
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
