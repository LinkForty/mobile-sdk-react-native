/**
 * LinkForty React Native SDK
 *
 * Deep linking and mobile attribution for React Native apps
 *
 * @packageDocumentation
 */

// Export singleton SDK instance as default
export { default } from './LinkFortySDK';

// Export classes
export { LinkFortySDK } from './LinkFortySDK';
export { FingerprintCollector } from './FingerprintCollector';
export { DeepLinkHandler } from './DeepLinkHandler';

// Export types
export type {
  LinkFortyConfig,
  DeviceFingerprint,
  DeepLinkData,
  InstallAttributionResponse,
  EventData,
  DeferredDeepLinkCallback,
  DeepLinkCallback,
  ResolveFunction,
  CreateLinkOptions,
  CreateLinkResult,
} from './types';
