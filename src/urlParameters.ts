import type { DeepLinkData } from './types';

/**
 * Query-parameter handling for deep links, kept free of React Native imports.
 *
 * These two functions are the whole of the parameter contract, and both are
 * pure — which is why they live here rather than on DeepLinkHandler. That class
 * imports `react-native`, whose Flow-typed entry point cannot be parsed by the
 * test runner, so anything defined on it is effectively untestable.
 */

/** Names LinkForty consumes; none of them are custom parameters. */
function isReserved(key: string): boolean {
  const lower = key.toLowerCase();
  //   utm_*    surfaced separately as utmParameters
  //   fp_*     fingerprint signals the SDK sends when resolving a link
  //   lf_click the click id appended to a destination URL
  return lower.startsWith('utm_') || lower.startsWith('fp_') || lower === 'lf_click';
}

/**
 * The custom parameters carried on a URL.
 *
 * Mirrors the server's own filter so a direct open and a deferred install agree
 * on what reaches the app. A tapped short link would not normally carry `fp_*`
 * or `lf_click`, but the URL is public and anyone can append them.
 */
export function extractCustomParameters(entries: Iterable<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!isReserved(key)) out[key] = value;
  }
  return out;
}

/**
 * Overlay the parameters from the opened URL onto the server's payload.
 *
 * Resolving a short code returns the link's *stored* configuration; the server
 * has no way to know what was appended to the URL that was actually tapped. The
 * SDK does, having just parsed it. Without this merge a link shared as
 * `?slug=titanic` reaches the app with that value missing on a direct open,
 * while the same link after a deferred install carries it — the server merges
 * the click's parameters there. This applies the same rule where no click row
 * exists, so both paths hand the app the same shape.
 *
 * URL values win on a key collision, matching that server-side precedence: what
 * a sharer put on the URL is more specific than the link's stored setup.
 *
 * Only `customParameters` is merged. `linkId`, `deepLinkPath`, `appScheme`, the
 * store URLs and `utmParameters` are server truth a local parse cannot know and
 * must not overwrite.
 */
export function mergeUrlParameters(
  resolved: DeepLinkData,
  fromUrl: Record<string, string> | undefined,
): DeepLinkData {
  if (!fromUrl || Object.keys(fromUrl).length === 0) return resolved;
  return {
    ...resolved,
    customParameters: { ...(resolved.customParameters ?? {}), ...fromUrl },
  };
}
