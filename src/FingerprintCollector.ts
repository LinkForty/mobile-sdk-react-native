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

    const fingerprint: DeviceFingerprint = {
      userAgent: await DeviceInfo.getUserAgent(),
      timezone,
      language,
      screenResolution: `${width}x${height}`,
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

    const params = new URLSearchParams({
      ua: fingerprint.userAgent,
      tz: fingerprint.timezone,
      lang: fingerprint.language,
      screen: fingerprint.screenResolution,
      platform: fingerprint.platform,
      ...(fingerprint.deviceModel && { model: fingerprint.deviceModel }),
      ...(fingerprint.osVersion && { os: fingerprint.osVersion }),
      ...(fingerprint.appVersion && { app_version: fingerprint.appVersion }),
    });

    return params.toString();
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
