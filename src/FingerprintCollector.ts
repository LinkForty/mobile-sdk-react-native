/**
 * FingerprintCollector - Collects device fingerprint data for attribution matching
 */

import { Platform, Dimensions, NativeModules } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import type { DeviceFingerprint } from './types';
import { normalizeLanguageTag } from './languageTag';

/** How long the device's user agent lookup may take before a generated one is used. */
export const USER_AGENT_TIMEOUT_MS = 3000;

export class FingerprintCollector {
  /**
   * Collect device fingerprint data
   */
  static async collect(): Promise<DeviceFingerprint> {
    const { width, height } = Dimensions.get('window');
    const timezone = this.getTimezone();
    const language = this.getLanguage();

    const [deviceModel, osVersion, appVersion] = await Promise.all([
      DeviceInfo.getModel(),
      DeviceInfo.getSystemVersion(),
      DeviceInfo.getVersion(),
    ]);

    // Round dimensions — Android returns floats (e.g. 434.717) but the server expects integers
    const fingerprint: DeviceFingerprint = {
      userAgent: await this.getUserAgent(osVersion, appVersion),
      timezone,
      language,
      screenResolution: `${Math.round(width)}x${Math.round(height)}`,
      platform: Platform.OS,
      deviceModel,
      osVersion,
      appVersion,
    };

    return fingerprint;
  }

  /**
   * The device's web user agent, or a generated `<app>/<version> iOS/<os>`
   * (or `Android/<os>`) one when the lookup fails or takes longer than
   * USER_AGENT_TIMEOUT_MS. On iOS the lookup runs a WKWebView on the main
   * thread and can fail to settle; the generated form is the one the native
   * SDKs send, which the server matches by platform and OS version.
   */
  private static async getUserAgent(osVersion: string, appVersion: string): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('user agent lookup timed out')), USER_AGENT_TIMEOUT_MS);
      });
      const userAgent = await Promise.race([DeviceInfo.getUserAgent(), timeout]);
      if (typeof userAgent === 'string' && userAgent !== '' && userAgent !== 'unknown') {
        return userAgent;
      }
    } catch {
      // Fall through to the generated user agent
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
    let appName = 'App';
    try {
      const name = typeof DeviceInfo.getApplicationName === 'function' ? DeviceInfo.getApplicationName() : '';
      if (typeof name === 'string' && name !== '' && name !== 'unknown') appName = name;
    } catch {
      // Keep the default
    }
    return `${appName}/${appVersion} ${platform}/${osVersion}`;
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
   * Get device language as `language` or `language-REGION` (e.g. `en-ES`)
   */
  private static getLanguage(): string {
    try {
      // Try to get locale from NativeModules
      const locale = normalizeLanguageTag(
        Platform.select({
          ios: NativeModules.SettingsManager?.settings?.AppleLocale ||
                NativeModules.SettingsManager?.settings?.AppleLanguages?.[0],
          android: NativeModules.I18nManager?.localeIdentifier,
        })
      );

      if (locale) {
        return locale;
      }

      // Fallback to navigator if available
      const browserLocale =
        typeof navigator !== 'undefined' ? normalizeLanguageTag(navigator.language) : undefined;
      if (browserLocale) {
        return browserLocale;
      }

      return 'en-US';
    } catch (error) {
      return 'en-US';
    }
  }
}
