/**
 * DeepLinkHandler - Handles Universal Links (iOS) and App Links (Android)
 *
 * When the OS intercepts a LinkForty URL via App Links or Universal Links,
 * the redirect server is bypassed. This handler detects LinkForty URLs and
 * resolves them via the server API to retrieve the full deep link data
 * (custom parameters, UTM params, etc.) that would normally be appended
 * during the redirect.
 */

import { Linking } from 'react-native';
import { FingerprintCollector } from './FingerprintCollector';
import type { DeepLinkData, DeepLinkCallback, ResolveFunction } from './types';

export class DeepLinkHandler {
  private callback: DeepLinkCallback | null = null;
  private baseUrl: string | null = null;
  private resolveFn: ResolveFunction | null = null;

  /**
   * Initialize deep link listener
   * @param baseUrl - LinkForty instance base URL for detecting LinkForty URLs
   * @param callback - Callback invoked with parsed/resolved deep link data
   * @param resolveFn - Optional function to resolve LinkForty URLs via the server API
   */
  initialize(baseUrl: string, callback: DeepLinkCallback, resolveFn?: ResolveFunction): void {
    this.baseUrl = baseUrl;
    this.callback = callback;
    this.resolveFn = resolveFn || null;

    // Listen for deep links when app is already open
    Linking.addEventListener('url', this.handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        this.handleDeepLink({ url });
      }
    });
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    Linking.removeAllListeners('url');
    this.callback = null;
  }

  /**
   * Handle incoming deep link.
   * If the URL is a LinkForty URL and a resolver is available, resolves via the server.
   * Falls back to local URL parsing on failure.
   */
  private handleDeepLink = async ({ url }: { url: string }): Promise<void> => {
    if (!this.callback || !url) {
      return;
    }

    // Parse locally first (for fallback and to detect LinkForty URLs)
    const localData = this.parseURL(url);

    // If this is a LinkForty URL and we have a resolver, try the server
    if (localData && this.resolveFn && this.baseUrl && url.startsWith(this.baseUrl)) {
      try {
        const resolvedData = await this.resolveURL(url);
        if (resolvedData) {
          this.callback(url, resolvedData);
          return;
        }
      } catch (error) {
        console.warn('[LinkForty] Failed to resolve URL from server, falling back to local parse:', error);
      }
    }

    // Fallback to locally-parsed data
    this.callback(url, localData);
  };

  /**
   * Resolve a LinkForty URL via the server API.
   * Extracts the path from the URL, collects fingerprint data for click attribution,
   * and calls the resolve endpoint.
   */
  private async resolveURL(url: string): Promise<DeepLinkData | null> {
    if (!this.resolveFn) {
      return null;
    }

    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathSegments.length === 0) {
      return null;
    }

    // Build resolve endpoint path (handles both /shortCode and /templateSlug/shortCode)
    let resolvePath: string;
    if (pathSegments.length >= 2) {
      resolvePath = `/api/sdk/v1/resolve/${pathSegments[0]}/${pathSegments[1]}`;
    } else {
      resolvePath = `/api/sdk/v1/resolve/${pathSegments[0]}`;
    }

    // Collect fingerprint data for click attribution
    try {
      const fingerprint = await FingerprintCollector.collect();
      const [sw, sh] = fingerprint.screenResolution.split('x');
      const queryParams = new URLSearchParams();
      queryParams.set('fp_tz', fingerprint.timezone);
      queryParams.set('fp_lang', fingerprint.language);
      queryParams.set('fp_sw', sw);
      queryParams.set('fp_sh', sh);
      queryParams.set('fp_platform', fingerprint.platform);
      if (fingerprint.osVersion) {
        queryParams.set('fp_pv', fingerprint.osVersion);
      }

      resolvePath += `?${queryParams.toString()}`;
    } catch (error) {
      // If fingerprint collection fails, still resolve without it
      console.warn('[LinkForty] Fingerprint collection failed, resolving without fingerprint:', error);
    }

    return this.resolveFn(resolvePath);
  }

  /**
   * Parse deep link URL and extract data locally (without server call).
   * Used as fallback when server resolution fails or for non-LinkForty URLs.
   */
  parseURL(url: string): DeepLinkData | null {
    try {
      const parsedUrl = new URL(url);

      // Check if this is a LinkForty URL
      if (this.baseUrl && !url.startsWith(this.baseUrl)) {
        return null;
      }

      // Extract short code from path (last segment handles both /shortCode and /templateSlug/shortCode)
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      const shortCode = pathSegments[pathSegments.length - 1];

      if (!shortCode) {
        return null;
      }

      // Extract UTM parameters
      const utmParameters = {
        source: parsedUrl.searchParams.get('utm_source') || undefined,
        medium: parsedUrl.searchParams.get('utm_medium') || undefined,
        campaign: parsedUrl.searchParams.get('utm_campaign') || undefined,
        term: parsedUrl.searchParams.get('utm_term') || undefined,
        content: parsedUrl.searchParams.get('utm_content') || undefined,
      };

      // Extract all other query parameters as custom parameters
      const customParameters: Record<string, string> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        if (!key.startsWith('utm_')) {
          customParameters[key] = value;
        }
      });

      return {
        shortCode,
        utmParameters,
        customParameters: Object.keys(customParameters).length > 0 ? customParameters : undefined,
      };
    } catch (error) {
      console.error('Failed to parse deep link URL:', error);
      return null;
    }
  }
}
