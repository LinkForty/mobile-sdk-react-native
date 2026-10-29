/**
 * LinkFortySDK - Main SDK class for LinkForty deep linking and attribution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FingerprintCollector } from './FingerprintCollector';
import { DeepLinkHandler } from './DeepLinkHandler';
import { AttributionContext } from './AttributionContext';
import { NavigationTracker } from './NavigationTracker';
import { LinkDomains } from './LinkDomains';
import { DeferredDeepLink, deferredDeepLinkFromInstall } from './DeferredDeepLink';
import { SDK_NAME, SDK_VERSION } from './version';
import { readPlayInstallReferrer } from './InstallReferrer';
import type {
  LinkFortyConfig,
  InstallAttributionResponse,
  DeepLinkData,
  DeferredDeepLinkCallback,
  DeferredDeepLinkResult,
  DeepLinkCallback,
  CreateLinkOptions,
  CreateLinkResult,
} from './types';

/** How long a request may take before it is abandoned (`requestTimeoutMs`). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** How many events tracked while init() runs are held for it to finish. */
const PENDING_EVENT_LIMIT = 100;

/** An event tracked before init() finished, sent once the install ID is known. */
interface PendingEvent {
  name: string;
  properties: Record<string, any>;
  timestamp: string;
}

const STORAGE_KEYS = {
  INSTALL_ID: '@linkforty:install_id',
  INSTALL_DATA: '@linkforty:install_data',
  /**
   * Set once the server has accepted the install report. Versions up to
   * 1.9.0 set it before sending the report, so on its own it doesn't prove
   * the report was accepted; it is still written so a downgraded app doesn't
   * report again.
   */
  INSTALL_REPORTED: '@linkforty:first_launch',
  /**
   * Set when the server accepts an install report (a 2xx response), even one
   * without an install ID, so such a response can't trigger a report on every
   * launch.
   */
  INSTALL_REPORT_ACCEPTED: '@linkforty:install_report_accepted',
};

export class LinkFortySDK {
  private config: LinkFortyConfig | null = null;
  private deepLinkHandler: DeepLinkHandler | null = null;
  /** Delivers the deferred deep link on the launch that reports the install */
  private deferredDeepLink = new DeferredDeepLink();
  private installId: string | null = null;
  private externalUserId: string | null = null;
  private initialized: boolean = false;
  /** Last-click attribution + session context stamped onto every tracked event */
  private attribution: AttributionContext = new AttributionContext();
  /** Auto screen-view tracker (only created when autoTrackNavigation is enabled) */
  private navigationTracker: NavigationTracker | null = null;
  /** The workspace's link hosts, which decide which URLs are looked up as links */
  private linkDomains: LinkDomains | null = null;
  /** Events tracked while init() runs, sent once it has the install ID */
  private pendingEvents: PendingEvent[] = [];
  /** Whether this launch has already logged that storage is unavailable */
  private storageErrorLogged = false;

  /**
   * Initialize the SDK. Resolves once the install is reported (or the report
   * has failed) and the workspace's link hosts are being learned. Never
   * rejects for a network or storage failure; a thrown error can only come
   * from the app's own onDeferredDeepLink callback.
   */
  async init(config: LinkFortyConfig): Promise<void> {
    if (this.initialized) {
      console.warn('LinkForty SDK already initialized');
      return;
    }

    // Everything onDeepLink() needs is set before the first await, so an app
    // may call it right after init() without awaiting it: the handler it
    // registers on is this one, and it is given the link hosts below, which
    // it waits for (up to 3 seconds) on any link handled before they arrive.
    this.config = config;

    if (config.debug) {
      console.log('[LinkForty] Initializing SDK with config:', redactConfig(config));
    }

    // Learn the workspace's link hosts in the background
    this.linkDomains = new LinkDomains(
      config.baseUrl,
      (path) => this.apiRequest<{ domains: string[] }>(path),
      config.appToken,
      config.debug,
    );
    this.linkDomains.start();

    // The deep link handler for direct deep links
    this.deepLinkHandler = new DeepLinkHandler({ debug: config.debug });

    // Recreate the attribution context so it honors the debug flag, then restore
    // any persisted active context (a prior deep-link open) before we attribute
    // the install or load cached data.
    this.attribution = new AttributionContext({ debug: config.debug });
    await this.attribution.load();

    if (await this.isInstallReported()) {
      // Load cached install data
      await this.loadInstallData();
    } else {
      // First launch, or an earlier report failed: report the install and get
      // the deferred deep link. With the first-launch flag already set, this
      // is a device recovering from a report that failed on 1.9.0 or earlier.
      const recovery = (await this.readStorage(STORAGE_KEYS.INSTALL_REPORTED)) !== null;
      await this.reportInstall({ recovery });
    }

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

    await this.flushPendingEvents();
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
   * Register callback for deferred deep links, called once on the launch that
   * reports the install: with the link's data, or null for an organic install
   * or a failed report, and a result that says which (see
   * DeferredDeepLinkResult). Can be registered before or after init(). Later
   * launches don't call it; use getInstallData() for the install's link data.
   */
  onDeferredDeepLink(callback: DeferredDeepLinkCallback): void {
    this.deferredDeepLink.register(callback);
  }

  /**
   * Register callback for direct deep links (existing users).
   * When a LinkForty URL is detected, the SDK will resolve it via the server
   * to retrieve the full deep link data (custom parameters, UTM params, etc.).
   *
   * May be called as soon as init() has been called, without awaiting it.
   * Throws only if init() was never called.
   */
  onDeepLink(callback: DeepLinkCallback): void {
    if (!this.config) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    // init() creates the handler before its first await; this only guards a
    // config set by other means.
    if (!this.deepLinkHandler) {
      this.deepLinkHandler = new DeepLinkHandler({ debug: this.config.debug });
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

    this.deepLinkHandler.initialize(
      this.config.baseUrl,
      trackingCallback,
      resolveFn,
      this.linkDomains ?? undefined,
    );
  }

  /**
   * Track in-app event. An event tracked while init() is still running is
   * held (up to 100) and sent, with the time it was tracked, once init() has
   * the install ID; without one it is dropped with a warning.
   */
  async trackEvent(name: string, properties?: Record<string, any>): Promise<void> {
    if (!this.config) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    const event: PendingEvent = {
      name,
      properties: properties || {},
      timestamp: new Date().toISOString(),
    };

    if (!this.installId) {
      if (!this.initialized) {
        if (this.pendingEvents.length < PENDING_EVENT_LIMIT) {
          this.pendingEvents.push(event);
        } else if (this.config.debug) {
          console.warn('[LinkForty] Too many events before init() finished; dropped:', name);
        }
        return;
      }
      console.warn('[LinkForty] Cannot track event: No install ID available');
      return;
    }

    await this.sendEvent(event);
  }

  /** Sends the events held while init() ran, or drops them without an install ID. */
  private async flushPendingEvents(): Promise<void> {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    if (events.length === 0) return;

    if (!this.installId) {
      console.warn(`[LinkForty] Cannot track ${events.length} event(s): No install ID available`);
      return;
    }

    await Promise.all(events.map((event) => this.sendEvent(event)));
  }

  private async sendEvent(event: PendingEvent): Promise<void> {
    if (!this.config || !this.installId) return;

    // Backend expects: { installId, eventName, eventData, timestamp } and now
    // also accepts the last-click attribution stamp ({ attributedLinkId,
    // attributedClickId?, linkOpenedAt?, sessionId }) so screen views and custom
    // events are credited to the originating deep link. Older servers ignore the
    // extra fields (Zod strips unknown keys), so this stays backward-compatible.
    const requestBody = {
      installId: this.installId,
      eventName: event.name,
      eventData: event.properties,
      timestamp: event.timestamp,
      ...this.attribution.getStamp(),
      // SDK identity, so the server can tell which SDK and version sent it
      sdkName: SDK_NAME,
      sdkVersion: SDK_VERSION,
    };

    try {
      const response = await this.apiRequest('/api/sdk/v1/event', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (this.config.debug) {
        console.log('[LinkForty] Event tracked:', event.name, response);
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
   * Clear all cached data (for testing): the install ID and link data, the
   * install-reported flag, the attribution context and the saved link hosts.
   * The next launch reports a new install.
   */
  async clearData(): Promise<void> {
    // removeItem (not multiRemove) works with AsyncStorage 2.x and 3.x alike
    await Promise.all(
      [
        STORAGE_KEYS.INSTALL_ID,
        STORAGE_KEYS.INSTALL_DATA,
        STORAGE_KEYS.INSTALL_REPORTED,
        STORAGE_KEYS.INSTALL_REPORT_ACCEPTED,
      ].map(
        (key) => AsyncStorage.removeItem(key),
      ),
    );

    await this.attribution.clear();

    // Forget the saved link hosts, then learn them again
    if (this.linkDomains) {
      await this.linkDomains.reset();
    } else {
      await LinkDomains.clearSaved();
    }

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
   * Whether the server has accepted this install's report (on this or an
   * earlier launch): an install ID is stored, or a report got a 2xx response.
   *
   * Until then every launch reports the install, so a failed report is
   * retried. This also recovers devices where a version up to 1.9.0 set the
   * first-launch flag but its report failed (flag set, no install ID): they
   * report once after upgrading. A device with an install ID never reports
   * again.
   */
  private async isInstallReported(): Promise<boolean> {
    const [installId, accepted] = await Promise.all([
      this.readStorage(STORAGE_KEYS.INSTALL_ID),
      this.readStorage(STORAGE_KEYS.INSTALL_REPORT_ACCEPTED),
    ]);
    return installId !== null || accepted !== null;
  }

  /**
   * Reads a stored value; a storage failure reads as absent. The SDK then
   * behaves as on a first launch: it reports the install and delivers the
   * deferred deep link, so the app keeps working for the session, and it
   * logs the failure once per launch so the integration gets fixed. Storage
   * fails when the AsyncStorage native module isn't linked.
   */
  private async readStorage(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      this.storageFailed(error);
      return null;
    }
  }

  /** Stores a value; a storage failure is logged once per launch and otherwise ignored. */
  private async writeStorage(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      this.storageFailed(error);
    }
  }

  private storageFailed(error: unknown): void {
    if (this.storageErrorLogged) return;
    this.storageErrorLogged = true;
    console.error(
      '[LinkForty] Storage is unavailable (is @react-native-async-storage/async-storage installed and linked?). The install is reported on every launch until it works:',
      error,
    );
  }

  /**
   * Report app installation to LinkForty backend. Marks the install reported
   * only once the server accepts it; on failure the next launch reports again.
   *
   * A recovery report (a device whose report failed on 1.9.0 or earlier) only
   * restores the install ID: it doesn't call the deferred deep link callback
   * (the user has been using the app, so routing them like a fresh install
   * would be wrong), save link data or set the link credited for events.
   */
  private async reportInstall({ recovery = false }: { recovery?: boolean } = {}): Promise<void> {
    if (!this.config) {
      return;
    }

    // Delivered once, after the try/catch, so an app callback that throws
    // surfaces as such instead of being logged as a failed report and
    // followed by a second, contradicting delivery.
    let outcome: { data: DeepLinkData | null; result: DeferredDeepLinkResult } | null = null;

    try {
      // Collect device fingerprint, and on Android the Play install referrer,
      // which names the click exactly
      const [fingerprint, installReferrer] = await Promise.all([
        FingerprintCollector.collect(),
        readPlayInstallReferrer(),
      ]);

      if (this.config.debug) {
        console.log('[LinkForty] Reporting install with fingerprint:', fingerprint);
        console.log('[LinkForty] Play install referrer:', installReferrer);
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
            // SDK identity, so the server can tell which SDK and version sent it
            sdkName: SDK_NAME,
            sdkVersion: SDK_VERSION,
            // Public workspace token; lets the server scope organic installs
            // (those with no click match) to the right workspace. Omitted
            // entirely when not configured; the server then scopes organic
            // installs to no workspace.
            appToken: this.config.appToken,
            // Google Play install referrer (Android); omitted when there is none
            installReferrer: installReferrer ?? undefined,
          }),
        }
      );

      if (this.config.debug) {
        console.log('[LinkForty] Install response:', response);
      }

      // Store install ID
      if (response.installId) {
        this.installId = response.installId;
        await this.writeStorage(STORAGE_KEYS.INSTALL_ID, response.installId);
      }

      // The server accepted the report: don't report this install again
      await this.writeStorage(STORAGE_KEYS.INSTALL_REPORT_ACCEPTED, 'true');
      await this.writeStorage(STORAGE_KEYS.INSTALL_REPORTED, 'true');

      // A recovery report only restores the install ID. Its match is a
      // fingerprint match made now, not the click that led to the install, so
      // it is neither saved as install data nor credited for later events (a
      // link tap that opens the app sets that through the deep link path).
      if (recovery) {
        if (this.config.debug) {
          console.log('[LinkForty] Install ID restored; link data from this report is not used');
        }
        return;
      }

      // If attributed, store deep link data
      const deepLinkData = deferredDeepLinkFromInstall(response);
      if (deepLinkData) {
        await this.writeStorage(STORAGE_KEYS.INSTALL_DATA, JSON.stringify(deepLinkData));

        // Seed the last-click attribution context from the deferred deep link so
        // the new user's first-session screen views + events are credited to the
        // install link.
        if (deepLinkData.linkId) {
          await this.attribution.recordDeepLinkOpen(deepLinkData.linkId);
        }

        outcome = { data: deepLinkData, result: { status: 'attributed' } };

        if (this.config.debug) {
          console.log('[LinkForty] Install attributed with confidence:', response.confidenceScore);
          console.log('[LinkForty] Matched factors:', response.matchedFactors);
          console.log('[LinkForty] Competing links:', deepLinkData.competingLinks);
        }
      } else {
        if (this.config.debug) {
          console.log('[LinkForty] Install not attributed (organic install)');
        }

        // null indicates an organic install
        outcome = { data: null, result: { status: 'organic' } };
      }
    } catch (error) {
      console.error('[LinkForty] Failed to report install (retried on the next launch):', error);

      // null on error; the result says the report failed, and the next launch
      // reports again
      outcome = {
        data: null,
        result: { status: 'failed', error: error instanceof Error ? error : new Error(String(error)) },
      };
    }

    if (outcome && !recovery) {
      this.deferredDeepLink.deliver(outcome.data, outcome.result);
    }
  }

  /**
   * Load cached install data
   */
  private async loadInstallData(): Promise<void> {
    this.installId = await this.readStorage(STORAGE_KEYS.INSTALL_ID);
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
      // SDK identity header: name/version on every SDK request.
      'X-LinkForty-SDK': `${SDK_NAME}/${SDK_VERSION}`,
    };

    // Add API key if provided
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Names the app's workspace: scopes link lookups to it.
    if (this.config.appToken) {
      headers['X-LinkForty-App-Token'] = this.config.appToken;
    }

    // React Native sets no network timeout on Android, so every request is
    // abandoned after requestTimeoutMs. AbortController is in React Native
    // since 0.60; the guard keeps older or custom runtimes working untimed.
    const timeoutMs = this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        ...(controller && { signal: controller.signal }),
        headers: {
          ...headers,
          ...options.headers,
        },
      });
    } catch (error) {
      if (controller?.signal.aborted) {
        const timeout: Error & { code?: string } = new Error(
          `Request timed out after ${timeoutMs}ms: ${options.method || 'GET'} ${endpoint}`,
        );
        timeout.code = 'timeout';
        throw timeout;
      }
      throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }

    if (!response.ok) {
      // The status always names the failure; a JSON body's message (or Core's
      // `error`) is appended. A proxy's HTML error page adds nothing.
      const body = (await response.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
      const detail = [body?.message, body?.error].find((v) => typeof v === 'string' && v !== '');
      const error: Error & { status?: number } = new Error(
        detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }

    return response.json();
  }
}

/** The config as logged with `debug`: the API key, a secret, is redacted. */
function redactConfig(config: LinkFortyConfig): Record<string, unknown> {
  const { apiKey, navigationRef, ...rest } = config;
  return {
    ...rest,
    ...(apiKey !== undefined && { apiKey: '[redacted]' }),
    ...(navigationRef !== undefined && { navigationRef: '[set]' }),
  };
}

// Export singleton instance
export default new LinkFortySDK();
