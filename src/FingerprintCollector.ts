/**
 * FingerprintCollector - Collects device fingerprint data for attribution matching
 */

import { Platform, Dimensions, NativeModules } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import type { DeviceFingerprint } from './types';

export class FingerprintCollector {
  /**
   * Collect device fingerprint data
   */
  static async collect(): Promise<DeviceFingerprint> {
    const { width, height } = Dimensions.get('window');
    const timezone = this.getTimezone();
    const language = this.getLanguage();

    // Round dimensions — Android returns floats (e.g. 434.717) but the server expects integers
    const fingerprint: DeviceFingerprint = {
      userAgent: await DeviceInfo.getUserAgent(),
      timezone,
      language,
      screenResolution: `${Math.round(width)}x${Math.round(height)}`,
      platform: Platform.OS,
      deviceModel: await DeviceInfo.getModel(),
      osVersion: await DeviceInfo.getSystemVersion(),
      appVersion: await DeviceInfo.getVersion(),
    };

    return fingerprint;
  }

  /**
   * Generate query parameters from fingerprint for URL
   */
  static async generateQueryParams(): Promise<string> {
    const fingerprint = await this.collect();

    // Build query string manually — URLSearchParams is not reliable in Hermes
    const params: Record<string, string> = {
      ua: fingerprint.userAgent,
      tz: fingerprint.timezone,
      lang: fingerprint.language,
      screen: fingerprint.screenResolution,
      platform: fingerprint.platform,
    };
    if (fingerprint.deviceModel) params.model = fingerprint.deviceModel;
    if (fingerprint.osVersion) params.os = fingerprint.osVersion;
    if (fingerprint.appVersion) params.app_version = fingerprint.appVersion;

    return Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Get device timezone
   */
  private static getTimezone(): string {
    try {
      // Get timezone using Intl API
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
      return 'UTC';
    }
  }

  /**
   * Get device language
   */
  private static getLanguage(): string {
    try {
      // Try to get locale from NativeModules
      const locale = Platform.select({
        ios: NativeModules.SettingsManager?.settings?.AppleLocale ||
              NativeModules.SettingsManager?.settings?.AppleLanguages?.[0],
        android: NativeModules.I18nManager?.localeIdentifier,
      });

      if (locale) {
        return locale;
      }

      // Fallback to navigator if available
      if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language;
      }

      return 'en-US';
    } catch (error) {
      return 'en-US';
    }
  }
}
