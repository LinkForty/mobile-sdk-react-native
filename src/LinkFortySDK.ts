/**
 * LinkFortySDK - Main SDK class for LinkForty deep linking and attribution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FingerprintCollector } from './FingerprintCollector';
import { DeepLinkHandler } from './DeepLinkHandler';
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
  private initialized: boolean = false;

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

    this.initialized = true;

    if (config.debug) {
      console.log('[LinkForty] SDK initialized successfully');
    }
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

    this.deepLinkHandler.initialize(this.config.baseUrl, callback, resolveFn);
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

    // Backend expects: { installId, eventName, eventData, timestamp }
    const requestBody = {
      installId: this.installId,
      eventName: name,
      eventData: properties || {},
      timestamp: new Date().toISOString(),
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

    // Use the simplified SDK endpoint when no templateId is provided
    const useSimplifiedEndpoint = !options.templateId;
    const endpoint = useSimplifiedEndpoint ? '/api/sdk/v1/links' : '/api/links';

    const response = await this.apiRequest<{ id: string; short_code: string; url?: string; shortCode?: string; linkId?: string }>(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );

    // The SDK endpoint returns { url, shortCode, linkId } directly
    if (useSimplifiedEndpoint && response.url) {
      return {
        url: response.url,
        shortCode: response.shortCode || response.short_code,
        linkId: response.linkId || response.id,
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

    this.installId = null;

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
        .map(Number);

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
