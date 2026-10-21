import type { DeepLinkData, DeferredDeepLinkCallback } from './types';

/**
 * Delivers the deferred deep link once, on the launch that reports the install:
 * the link's data, or null for an organic install. A callback registered after
 * that is called with the same result; on later launches nothing is delivered.
 *
 * Kept free of React Native imports so it can be tested (see urlParameters.ts).
 */
export class DeferredDeepLink {
  private callback: DeferredDeepLinkCallback | null = null;
  private delivered = false;
  private data: DeepLinkData | null = null;

  /** Registers the callback, replacing any earlier one. */
  register(callback: DeferredDeepLinkCallback): void {
    this.callback = callback;
    if (this.delivered) callback(this.data);
  }

  /** Delivers the install's result. Called only on the launch that reports the install. */
  deliver(data: DeepLinkData | null): void {
    this.data = data;
    this.delivered = true;
    this.callback?.(data);
  }
}
