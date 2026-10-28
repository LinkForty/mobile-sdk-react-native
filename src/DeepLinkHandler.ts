/**
 * DeepLinkHandler - Handles Universal Links (iOS) and App Links (Android)
 *
 * When the OS intercepts a LinkForty URL via App Links or Universal Links,
 * the redirect server is bypassed. This handler detects LinkForty URLs and
 * resolves them via the server API to retrieve the full deep link data
 * (custom parameters, UTM params, etc.) that would normally be appended
 * during the redirect.
 *
 * Logs only with `debug` on: URLs and link data never reach the console
 * otherwise.
 */

import { Linking } from 'react-native';
import { FingerprintCollector } from './FingerprintCollector';
import { extractCustomParameters, mergeUrlParameters } from './urlParameters';
import { hostOf, type LinkDomains } from './LinkDomains';
import type { DeepLinkData, DeepLinkCallback, ResolveFunction } from './types';

export class DeepLinkHandler {
  private callback: DeepLinkCallback | null = null;
  private baseUrl: string | null = null;
  private resolveFn: ResolveFunction | null = null;
  private linkDomains: LinkDomains | null = null;
  private readonly debug: boolean;
  /** The `Linking` 'url' subscription, added once and removed by cleanup() */
  private subscription: { remove: () => void } | null = null;

  /**
   * @param options.debug - Log each link handled, its resolution and fallbacks
   *   (default: false, logs nothing)
   */
  constructor(options: { debug?: boolean } = {}) {
    this.debug = options.debug ?? false;
  }

  private log(...args: unknown[]): void {
    if (this.debug) console.log('[LinkForty]', ...args);
  }

  /**
   * Parse a URL string manually.
   * The URL/URLSearchParams APIs are not fully implemented in React Native's Hermes engine
   * (URL.pathname throws "not implemented"), so we parse with basic string operations.
   */
  private static parseUrlString(url: string): { pathname: string; searchParams: Map<string, string> } | null {
    try {
      const protocolEnd = url.indexOf('://');
      if (protocolEnd === -1) return null;

      const afterProtocol = url.substring(protocolEnd + 3);
      const pathStart = afterProtocol.indexOf('/');
      const pathAndQuery = pathStart === -1 ? '/' : afterProtocol.substring(pathStart);

      const hashIndex = pathAndQuery.indexOf('#');
      const withoutHash = hashIndex === -1 ? pathAndQuery : pathAndQuery.substring(0, hashIndex);

      const queryStart = withoutHash.indexOf('?');
      const pathname = queryStart === -1 ? withoutHash : withoutHash.substring(0, queryStart);
      const queryString = queryStart === -1 ? '' : withoutHash.substring(queryStart + 1);

      const searchParams = new Map<string, string>();
      if (queryString) {
        for (const pair of queryString.split('&')) {
          const eqIndex = pair.indexOf('=');
          if (eqIndex === -1) {
            searchParams.set(decodeURIComponent(pair), '');
          } else {
            searchParams.set(
              decodeURIComponent(pair.substring(0, eqIndex)),
              decodeURIComponent(pair.substring(eqIndex + 1)),
            );
          }
        }
      }

      return { pathname, searchParams };
    } catch {
      return null;
    }
  }

  /**
   * Build a query string from key-value pairs without URLSearchParams.
   */
  private static buildQueryString(params: Record<string, string>): string {
    return Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Initialize deep link listener. Calling it again replaces the callback
   * (the newest one receives links) without adding a second listener.
   * @param baseUrl - LinkForty instance base URL for detecting LinkForty URLs
   * @param callback - Callback invoked with parsed/resolved deep link data
   * @param resolveFn - Optional function to resolve LinkForty URLs via the server API
   * @param linkDomains - Optional workspace link hosts; URLs on them are LinkForty URLs too
   */
  initialize(
    baseUrl: string,
    callback: DeepLinkCallback,
    resolveFn?: ResolveFunction,
    linkDomains?: LinkDomains,
  ): void {
    this.baseUrl = baseUrl;
    this.callback = callback;
    this.resolveFn = resolveFn || null;
    this.linkDomains = linkDomains || null;

    this.log('DeepLinkHandler.initialize: baseUrl=', baseUrl, 'hasResolveFn=', !!resolveFn);

    // Listen for deep links when app is already open (one listener per handler)
    if (!this.subscription) {
      this.subscription = Linking.addEventListener('url', this.handleDeepLink);
    }

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      this.log('getInitialURL result:', url);
      if (url) {
        this.handleDeepLink({ url });
      } else {
        this.log('getInitialURL returned null — app may not have been opened via deep link, or Android consumed the Intent');
      }
    });
  }

  /**
   * Remove this handler's listener. Other 'url' listeners (the app's own)
   * are left in place.
   */
  cleanup(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.callback = null;
  }

  /**
   * Handle incoming deep link.
   * If the URL is a LinkForty URL and a resolver is available, resolves via the server.
   * Falls back to local URL parsing on failure.
   */
  private handleDeepLink = async ({ url }: { url: string }): Promise<void> => {
    this.log('handleDeepLink called with url:', url);

    if (!this.callback || !url) {
      this.log('handleDeepLink early return: callback=', !!this.callback, 'url=', url);
      return;
    }

    // Parse a LinkForty URL locally first, for the fallback
    const isLinkFortyUrl = await this.isLinkFortyUrl(url);
    const localData = isLinkFortyUrl ? this.parseLinkURL(url) : null;
    this.log('localData parsed:', JSON.stringify(localData));

    // If this is a LinkForty URL and we have a resolver, try the server
    if (localData && this.resolveFn) {
      try {
        this.log('Resolving URL via server...');
        const resolvedData = await this.resolveURL(url);
        this.log('Resolve result:', JSON.stringify(resolvedData));
        if (resolvedData) {
          this.callback(url, mergeUrlParameters(resolvedData, localData?.customParameters));
          return;
        }
        this.log('Resolve returned null, falling back to local parse');
      } catch (error) {
        this.log('Failed to resolve URL from server, falling back to local parse:', error);
      }
    } else {
      this.log('Skipping server resolve: localData=', !!localData, 'resolveFn=', !!this.resolveFn, 'isLinkFortyUrl=', isLinkFortyUrl);
    }

    // Fallback to locally-parsed data (no customParameters from server)
    if (localData) {
      this.log('Using local fallback — customParameters will be empty for App Link URLs');
    }
    this.callback(url, localData);
  };

  /**
   * Whether `url` is on the base URL's host or one of the workspace's link
   * hosts (see LinkDomains).
   */
  private async isLinkFortyUrl(url: string): Promise<boolean> {
    if (this.linkDomains) return this.linkDomains.shouldLookUp(url);
    const host = hostOf(url);
    return host !== null && this.baseUrl !== null && host === hostOf(this.baseUrl);
  }

  /**
   * Resolve a LinkForty URL via the server API.
   * Extracts the path from the URL, collects fingerprint data for click attribution,
   * and calls the resolve endpoint.
   */
  private async resolveURL(url: string): Promise<DeepLinkData | null> {
    if (!this.resolveFn) {
      return null;
    }

    const parsed = DeepLinkHandler.parseUrlString(url);
    if (!parsed) {
      return null;
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);

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
      const fpParams: Record<string, string> = {
        fp_tz: fingerprint.timezone,
        fp_lang: fingerprint.language,
        fp_sw: sw,
        fp_sh: sh,
        fp_platform: fingerprint.platform,
      };
      if (fingerprint.osVersion) {
        fpParams.fp_pv = fingerprint.osVersion;
      }

      resolvePath += `?${DeepLinkHandler.buildQueryString(fpParams)}`;
    } catch (error) {
      // If fingerprint collection fails, still resolve without it
      this.log('Fingerprint collection failed, resolving without fingerprint:', error);
    }

    return this.resolveFn(resolvePath);
  }

  /**
   * Parse deep link URL and extract data locally (without server call).
   * Used as fallback when server resolution fails or for non-LinkForty URLs.
   */
  parseURL(url: string): DeepLinkData | null {
    // Check if this is a LinkForty URL
    if (this.baseUrl && !url.startsWith(this.baseUrl)) {
      return null;
    }
    return this.parseLinkURL(url);
  }

  /** Parse a LinkForty URL on any of its hosts. */
  private parseLinkURL(url: string): DeepLinkData | null {
    try {
      const parsed = DeepLinkHandler.parseUrlString(url);
      if (!parsed) {
        return null;
      }

      // Extract short code from path (last segment handles both /shortCode and /templateSlug/shortCode)
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      const shortCode = pathSegments[pathSegments.length - 1];

      if (!shortCode) {
        return null;
      }

      // Extract UTM parameters
      const utmParameters = {
        source: parsed.searchParams.get('utm_source') || undefined,
        medium: parsed.searchParams.get('utm_medium') || undefined,
        campaign: parsed.searchParams.get('utm_campaign') || undefined,
        term: parsed.searchParams.get('utm_term') || undefined,
        content: parsed.searchParams.get('utm_content') || undefined,
      };

      // Reserved names are excluded here; see urlParameters.ts.
      const customParameters = extractCustomParameters(parsed.searchParams.entries());

      return {
        shortCode,
        utmParameters,
        customParameters: Object.keys(customParameters).length > 0 ? customParameters : undefined,
      };
    } catch (error) {
      this.log('Failed to parse deep link URL:', error);
      return null;
    }
  }
}
