import type {
  DeepLinkData,
  DeferredDeepLinkCallback,
  DeferredDeepLinkResult,
  InstallAttributionResponse,
} from './types';

/**
 * The deferred deep link carried by an install response, or null when the
 * install is not attributed.
 *
 * `customParameters` is filled from the link's `deepLinkParameters`, so apps
 * read the same field on deferred and direct deep links. The match certainty
 * fields (`confidenceScore`, `matchedFactors`, `attributionMethod`,
 * `competingLinks`) are taken from the deep link data, or from the top level of
 * the response when the deep link data lacks them; a server that sends neither
 * leaves them undefined.
 */
export function deferredDeepLinkFromInstall(
  response: InstallAttributionResponse,
): DeepLinkData | null {
  if (!response.attributed || !response.deepLinkData) return null;

  const link = response.deepLinkData as DeepLinkData & {
    deepLinkParameters?: Record<string, string>;
  };

  return {
    ...link,
    customParameters: link.deepLinkParameters || link.customParameters,
    confidenceScore: link.confidenceScore ?? response.confidenceScore,
    matchedFactors: link.matchedFactors ?? response.matchedFactors,
    attributionMethod: link.attributionMethod ?? response.attributionMethod,
    competingLinks: link.competingLinks ?? response.competingLinks,
  };
}

/**
 * Delivers the deferred deep link once, on the launch that reports the install:
 * the link's data, or null for an organic install or a failed report, with a
 * result that says which. A callback registered after that is called with the
 * same result; on later launches nothing is delivered.
 *
 * Kept free of React Native imports so it can be tested (see urlParameters.ts).
 */
export class DeferredDeepLink {
  private callback: DeferredDeepLinkCallback | null = null;
  private delivered: { data: DeepLinkData | null; result: DeferredDeepLinkResult } | null = null;

  /** Registers the callback, replacing any earlier one. */
  register(callback: DeferredDeepLinkCallback): void {
    this.callback = callback;
    if (this.delivered) callback(this.delivered.data, this.delivered.result);
  }

  /** Delivers the install's result. Called only on the launch that reports the install. */
  deliver(data: DeepLinkData | null, result: DeferredDeepLinkResult): void {
    this.delivered = { data, result };
    this.callback?.(data, result);
  }
}
