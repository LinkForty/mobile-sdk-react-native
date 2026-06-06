/**
 * LinkFortySDK - Main SDK class for LinkForty deep linking and attribution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FingerprintCollector } from './FingerprintCollector';
import { DeepLinkHandler } from './DeepLinkHandler';
import { AttributionContext } from './AttributionContext';
import { NavigationTracker } from './NavigationTracker';
import { SDK_NAME, SDK_VERSION } from './version';
import type {
  LinkFortyConfig,
  InstallAttributionResponse,
  DeepLinkData,
  DeferredDeepLinkCallback,
  DeepLinkCallback,
  CreateLinkOptions,
  CreateLinkResult,
} from './types';

const STORAGE_KEYS = {
  INSTALL_ID: '@linkforty:install_id',
  INSTALL_DATA: '@linkforty:install_data',
  FIRST_LAUNCH: '@linkforty:first_launch',
};

export class LinkFortySDK {
  private config: LinkFortyConfig | null = null;
  private deepLinkHandler: DeepLinkHandler | null = null;
  private deferredDeepLinkCallback: DeferredDeepLinkCallback | null = null;
  private installId: string | null = null;
  private externalUserId: string | null = null;
  private initialized: boolean = false;
  /** Last-click attribution + session context stamped onto every tracked event */
  private attribution: AttributionContext = new AttributionContext();
  /** Auto screen-view tracker (only created when autoTrackNavigation is enabled) */
  private navigationTracker: NavigationTracker | null = null;

  /**
   * Initialize the SDK
   */
  async init(config: LinkFortyConfig): Promise<void> {
    if (this.initialized) {
      console.warn('LinkForty SDK already initialized');
      return;
    }

    this.config = config;

    if (config.debug) {
      console.log('[LinkForty] Initializing SDK with config:', config);
    }

    // Recreate the attribution context so it honors the debug flag, then restore
    // any persisted active context (a prior deep-link open) before we attribute
    // the install or load cached data.
    this.attribution = new AttributionContext({ debug: config.debug });
    await this.attribution.load();

    // Check if this is first launch
    const isFirstLaunch = await this.isFirstLaunch();

    if (isFirstLaunch) {
      // Report install and get deferred deep link
      await this.reportInstall();
    } else {
      // Load cached install data
      await this.loadInstallData();
    }

    // Initialize deep link handler for direct deep links
    this.deepLinkHandler = new DeepLinkHandler();

    // Start auto screen-view tracking if requested. Screen views flow through
    // trackEvent, so they inherit the last-click attribution stamp. Guarded so a
    // missing/invalid navigationRef (or no react-navigation) is a no-op.
    if (config.autoTrackNavigation) {
      if (config.navigationRef) {
        // `autoTrackNavigation` is either `true` (screen names only, no params)
        // or an options object with an explicit param allow-list.
        const navOptions =
          typeof config.autoTrackNavigation === 'object' ? config.autoTrackNavigation : {};
        this.navigationTracker = new NavigationTracker(
          config.navigationRef,
          (name, properties) => {
            void this.trackEvent(name, properties);
          },
          {
            debug: config.debug,
            captureParams: navOptions.captureParams,
            debounceMs: navOptions.debounceMs,
          },
        );
        this.navigationTracker.start();
      } else if (config.debug) {
        console.warn(
          '[LinkForty] autoTrackNavigation is enabled but no navigationRef was provided — screen tracking is disabled.',
        );
      }
    }

    this.initialized = true;

    if (config.debug) {
      console.log('[LinkForty] SDK initialized successfully');
    }
  }

  /**
   * Set the external user ID for attribution. This ID will be attached to all
   * links created via createLink() unless overridden per-call. Pass null to clear.
   */
  setExternalUserId(id: string | null): void {
    this.externalUserId = id;

    if (this.config?.debug) {
      console.log('[LinkForty] External user ID set:', id);
    }
  }

  /**
   * Get the current external user ID
   */
  getExternalUserId(): string | null {
    return this.externalUserId;
  }

  /**
   * Current session id — identifies one app-open journey. Rotates on cold start
   * and on each new deep-link open. Used to group a visit's screen-flow.
   */
  getSessionId(): string {
    return this.attribution.getSessionId();
  }

  /**
   * The link currently credited for in-app activity (last-click), or null if the
   * user's activity is organic (no deep link has opened the app).
   */
  getActiveAttribution(): import('./types').ActiveAttribution | null {
    return this.attribution.getActive();
  }

  /**
   * Get install attribution data (deferred deep link)
   */
  async getInstallData(): Promise<DeepLinkData | null> {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DATA);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * Register callback for deferred deep links (new installs)
   */
  onDeferredDeepLink(callback: DeferredDeepLinkCallback): void {
    this.deferredDeepLinkCallback = callback;

    // If we already have install data, call the callback immediately
    this.getInstallData().then((data) => {
      if (data && this.deferredDeepLinkCallback) {
        this.deferredDeepLinkCallback(data);
      }
    });
  }

  /**
   * Register callback for direct deep links (existing users).
   * When a LinkForty URL is detected, the SDK will resolve it via the server
   * to retrieve the full deep link data (custom parameters, UTM params, etc.).
   */
  onDeepLink(callback: DeepLinkCallback): void {
    if (!this.config) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    if (!this.deepLinkHandler) {
      this.deepLinkHandler = new DeepLinkHandler();
    }

    // Create a resolver that wraps the private apiRequest method
    const resolveFn = async (path: string): Promise<DeepLinkData | null> => {
      try {
        return await this.apiRequest<DeepLinkData>(path);
      } catch (error) {
        if (this.config?.debug) {
          console.log('[LinkForty] URL resolve failed:', error);
        }
        return null;
      }
    };

    // Wrap the developer's callback so that every direct (re-engagement) deep-link
    // open updates the last-click attribution context before their handler runs.
    // This is what credits a re-engagement click by an already-installed user to
    // the link they just tapped, instead of their original install link.
    const trackingCallback: DeepLinkCallback = (url, deepLinkData) => {
      if (deepLinkData?.linkId) {
        // Fire-and-forget; persistence failures must never block deep-link routing.
        void this.attribution.recordDeepLinkOpen(deepLinkData.linkId);
      }
      callback(url, deepLinkData);
    };

    this.deepLinkHandler.initialize(this.config.baseUrl, trackingCallback, resolveFn);
  }

  /**
   * Track in-app event
   */
  async trackEvent(name: string, properties?: Record<string, any>): Promise<void> {
    if (!this.config) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    if (!this.installId) {
      console.warn('[LinkForty] Cannot track event: No install ID available');
      return;
    }

    // Backend expects: { installId, eventName, eventData, timestamp } and now
    // also accepts the last-click attribution stamp ({ attributedLinkId,
    // attributedClickId?, linkOpenedAt?, sessionId }) so screen views and custom
    // events are credited to the originating deep link. Older servers ignore the
    // extra fields (Zod strips unknown keys), so this stays backward-compatible.
    const requestBody = {
      installId: this.installId,
      eventName: name,
      eventData: properties || {},
      timestamp: new Date().toISOString(),
      ...this.attribution.getStamp(),
      // SDK identity for health/version diagnostics (SIT-235)
      sdkName: SDK_NAME,
      sdkVersion: SDK_VERSION,
    };

    try {
      const response = await this.apiRequest('/api/sdk/v1/event', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (this.config.debug) {
        console.log('[LinkForty] Event tracked:', name, response);
      }
    } catch (error) {
      console.error('[LinkForty] Failed to track event:', error);
    }
  }

  /**
   * Track a revenue event.
   *
   * Convenience wrapper around `trackEvent` that sends a standardised
   * `"revenue"` event with `revenue` and `currency` fields in the
   * event data.  All four LinkForty SDKs (React Native, iOS, Android,
   * Expo) use the same convention so the Events dashboard can aggregate
   * revenue with a single query.
   *
   * @param amount  Non-negative revenue amount
   * @param currency  ISO 4217 currency code (e.g. "USD")
   * @param properties  Optional additional properties merged into event data
   */
  async trackRevenue(
    amount: number,
    currency: string,
    properties?: Record<string, any>,
  ): Promise<void> {
    if (amount < 0) {
      throw new Error('Revenue amount must be non-negative');
    }

    await this.trackEvent('revenue', {
      ...properties,
      revenue: amount,
      currency,
    });
  }

  /**
   * Create a new short link via the LinkForty API.
   *
   * Requires an API key to be configured in the SDK init options.
   * When `templateId` is omitted, uses the SDK endpoint which auto-selects
   * the organization's default template and returns the full URL.
   *
   * @example
   * ```ts
   * // Simple — server auto-selects template
   * const result = await LinkFortySDK.createLink({
   *   deepLinkParameters: { route: 'VIDEO_VIEWER', id: 'video-uuid' },
   *   title: 'My Video',
   * });
   *
   * // Explicit — specify template
   * const result = await LinkFortySDK.createLink({
   *   templateId: 'uuid-of-template',
   *   templateSlug: 'ToQs',
   *   deepLinkParameters: { route: 'VIDEO_VIEWER', id: 'video-uuid' },
   * });
   * ```
   */
  async createLink(options: CreateLinkOptions): Promise<CreateLinkResult> {
    if (!this.config) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    if (!this.config.apiKey) {
      throw new Error('API key required to create links. Pass apiKey in init().');
    }

    const body: Record<string, unknown> = {};

    if (options.templateId) {
      body.templateId = options.templateId;
    }
    if (options.deepLinkParameters) {
      body.deepLinkParameters = options.deepLinkParameters;
    }
    if (options.title) {
      body.title = options.title;
    }
    if (options.description) {
      body.description = options.description;
    }
    if (options.customCode) {
      body.customCode = options.customCode;
    }
    if (options.utmParameters) {
      body.utmParameters = options.utmParameters;
    }

    // Per-call externalUserId takes precedence, then fall back to SDK-level value
    const resolvedUserId = options.externalUserId ?? this.externalUserId;
    if (resolvedUserId) {
      body.externalUserId = resolvedUserId;
    }

    // Use the simplified SDK endpoint when no templateId is provided
    const useSimplifiedEndpoint = !options.templateId;
    const endpoint = useSimplifiedEndpoint ? '/api/sdk/v1/links' : '/api/links';

    const response = await this.apiRequest<{ id: string; short_code: string; url?: string; shortCode?: string; linkId?: string; deduplicated?: boolean }>(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );

    // The SDK endpoint returns { url, shortCode, linkId, deduplicated? } directly
    if (useSimplifiedEndpoint && response.url) {
      return {
        url: response.url,
        shortCode: response.shortCode || response.short_code,
        linkId: response.linkId || response.id,
        deduplicated: response.deduplicated,
      };
    }

    // The dashboard endpoint returns { id, short_code, ... } — build URL from parts
    const shortCode = response.short_code;
    const url = options.templateSlug
      ? `${this.config.baseUrl}/${options.templateSlug}/${shortCode}`
      : `${this.config.baseUrl}/${shortCode}`;

    if (this.config.debug) {
      console.log('[LinkForty] Created link:', url);
    }

    return {
      url,
      shortCode,
      linkId: response.id,
    };
  }

  /**
   * Get install ID
   */
  async getInstallId(): Promise<string | null> {
    if (this.installId) {
      return this.installId;
    }

    const cached = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_ID);
    if (cached) {
      this.installId = cached;
    }

    return this.installId;
  }

  /**
   * Clear all cached data (for testing)
   */
  async clearData(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.INSTALL_ID,
      STORAGE_KEYS.INSTALL_DATA,
      STORAGE_KEYS.FIRST_LAUNCH,
    ]);

    await this.attribution.clear();

    if (this.navigationTracker) {
      this.navigationTracker.stop();
      this.navigationTracker = null;
    }

    this.installId = null;
    this.externalUserId = null;

    if (this.config?.debug) {
      console.log('[LinkForty] All data cleared');
    }
  }

  /**
   * Check if this is the first app launch
   */
  private async isFirstLaunch(): Promise<boolean> {
    const firstLaunchFlag = await AsyncStorage.getItem(STORAGE_KEYS.FIRST_LAUNCH);

    if (!firstLaunchFlag) {
      await AsyncStorage.setItem(STORAGE_KEYS.FIRST_LAUNCH, 'true');
      return true;
    }

    return false;
  }

  /**
   * Report app installation to LinkForty backend
   */
  private async reportInstall(): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      // Collect device fingerprint
      const fingerprint = await FingerprintCollector.collect();

      if (this.config.debug) {
        console.log('[LinkForty] Reporting install with fingerprint:', fingerprint);
      }

      // Parse screen resolution (e.g., "1080x1920" -> [1080, 1920])
      const [screenWidth, screenHeight] = fingerprint.screenResolution
        .split('x')
        .map((v) => Math.round(Number(v)));

      // Convert attribution window from days to hours
      const attributionWindowHours = (this.config.attributionWindow || 7) * 24;

      // Call install endpoint with flattened structure matching backend contract
      const response = await this.apiRequest<InstallAttributionResponse>(
        '/api/sdk/v1/install',
        {
          method: 'POST',
          body: JSON.stringify({
            userAgent: fingerprint.userAgent,
            timezone: fingerprint.timezone,
            language: fingerprint.language,
            screenWidth,
            screenHeight,
            platform: fingerprint.platform,
            platformVersion: fingerprint.osVersion,
            deviceId: undefined, // Optional: Can add IDFA/GAID if available
            attributionWindowHours,
            // SDK identity for health/version diagnostics (SIT-235)
            sdkName: SDK_NAME,
            sdkVersion: SDK_VERSION,
            // Public workspace token; lets Cloud scope organic installs
            // (those with no click match) to the right workspace. Omitted
            // entirely when not configured — server treats absence as
            // "scope organic installs to no workspace" (current behavior).
            appToken: this.config.appToken,
          }),
        }
      );

      if (this.config.debug) {
        console.log('[LinkForty] Install response:', response);
      }

      // Store install ID
      if (response.installId) {
        this.installId = response.installId;
        await AsyncStorage.setItem(STORAGE_KEYS.INSTALL_ID, response.installId);
      }

      // If attributed, store deep link data
      if (response.attributed && response.deepLinkData) {
        // Normalize backend response to match DeepLinkData type
        // Populate customParameters from deepLinkParameters so app developers
        // get a consistent field regardless of direct vs deferred deep link path
        const deepLinkData: DeepLinkData = {
          ...response.deepLinkData as DeepLinkData,
          customParameters: (response.deepLinkData as any).deepLinkParameters
            || (response.deepLinkData as DeepLinkData).customParameters,
        };

        await AsyncStorage.setItem(
          STORAGE_KEYS.INSTALL_DATA,
          JSON.stringify(deepLinkData)
        );

        // Seed the last-click attribution context from the deferred deep link so
        // the new user's first-session screen views + events are credited to the
        // install link.
        if (deepLinkData.linkId) {
          await this.attribution.recordDeepLinkOpen(deepLinkData.linkId);
        }

        // Call deferred deep link callback if registered
        if (this.deferredDeepLinkCallback) {
          this.deferredDeepLinkCallback(deepLinkData);
        }

        if (this.config.debug) {
          console.log('[LinkForty] Install attributed with confidence:', response.confidenceScore);
          console.log('[LinkForty] Matched factors:', response.matchedFactors);
        }
      } else {
        if (this.config.debug) {
          console.log('[LinkForty] Install not attributed (organic install)');
        }

        // Call callback with null to indicate organic install
        if (this.deferredDeepLinkCallback) {
          this.deferredDeepLinkCallback(null);
        }
      }
    } catch (error) {
      console.error('[LinkForty] Failed to report install:', error);

      // Call callback with null on error
      if (this.deferredDeepLinkCallback) {
        this.deferredDeepLinkCallback(null);
      }
    }
  }

  /**
   * Load cached install data
   */
  private async loadInstallData(): Promise<void> {
    this.installId = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_ID);
  }

  /**
   * Make API request to LinkForty backend
   */
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.config) {
      throw new Error('SDK not initialized');
    }

    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // SDK identity header (SIT-235) — name/version on every SDK request.
      'X-LinkForty-SDK': `${SDK_NAME}/${SDK_VERSION}`,
    };

    // Add API key if provided
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }
}

// Export singleton instance
export default new LinkFortySDK();
