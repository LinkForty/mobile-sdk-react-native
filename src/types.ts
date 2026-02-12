/**
 * LinkForty React Native SDK Type Definitions
 */

/**
 * Configuration options for initializing the LinkForty SDK
 */
export interface LinkFortyConfig {
  /** Base URL of your LinkForty instance (e.g., 'https://go.yourdomain.com') */
  baseUrl: string;
  /** Optional API key for Cloud authentication */
  apiKey?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom attribution window in days (default: 7) */
  attributionWindow?: number;
}

/**
 * Device fingerprint data collected for attribution matching
 */
export interface DeviceFingerprint {
  /** IP address (server-side) */
  ip?: string;
  /** User agent string */
  userAgent: string;
  /** Device timezone */
  timezone: string;
  /** Device language */
  language: string;
  /** Screen resolution (width x height) */
  screenResolution: string;
  /** Device platform (ios/android) */
  platform: string;
  /** Device model */
  deviceModel?: string;
  /** OS version */
  osVersion?: string;
  /** App version */
  appVersion?: string;
}

/**
 * Deep link data containing URLs and parameters
 */
export interface DeepLinkData {
  /** Short code that was clicked */
  shortCode: string;
  /** iOS app URL */
  iosUrl?: string;
  /** Android app URL */
  androidUrl?: string;
  /** Web fallback URL */
  webUrl?: string;
  /** UTM parameters */
  utmParameters?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  /** Custom parameters (from URL query params on direct links, or from link configuration on deferred links) */
  customParameters?: Record<string, string>;
  /** In-app destination path (e.g., '/video/123') */
  deepLinkPath?: string;
  /** Custom URI scheme (e.g., 'myapp') */
  appScheme?: string;
  /** Click timestamp */
  clickedAt?: string;
  /** Link ID */
  linkId?: string;
}

/**
 * Response from install attribution endpoint
 * Matches backend contract from /api/sdk/v1/install
 */
export interface InstallAttributionResponse {
  /** Install event UUID */
  installId: string;
  /** Whether attribution was successful */
  attributed: boolean;
  /** Attribution confidence score (0-100) */
  confidenceScore: number;
  /** Array of matched fingerprint factors (e.g., ['ip', 'user_agent', 'timezone', 'language', 'screen']) */
  matchedFactors: string[];
  /** Deep link data if attributed (contains shortCode, URLs, UTM params, confidence, etc.) */
  deepLinkData: DeepLinkData | Record<string, never>;
}

/**
 * Event data for tracking in-app events
 */
export interface EventData {
  /** Event name (e.g., 'purchase', 'signup', 'add_to_cart') */
  name: string;
  /** Event properties */
  properties?: Record<string, any>;
  /** Revenue amount (for conversion events) */
  revenue?: number;
  /** Currency code (e.g., 'USD') */
  currency?: string;
  /** Install ID for attribution */
  installId?: string;
}

/**
 * Callback function for deferred deep links
 */
export type DeferredDeepLinkCallback = (deepLinkData: DeepLinkData | null) => void;

/**
 * Callback function for direct deep links
 */
export type DeepLinkCallback = (url: string, deepLinkData: DeepLinkData | null) => void;

/**
 * Function that resolves a LinkForty URL path to deep link data via the server.
 * Used internally by DeepLinkHandler when the OS intercepts a LinkForty URL
 * before the server can process the redirect.
 */
export type ResolveFunction = (path: string) => Promise<DeepLinkData | null>;
