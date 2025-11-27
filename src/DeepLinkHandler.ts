/**
 * DeepLinkHandler - Handles Universal Links (iOS) and App Links (Android)
 */

import { Linking } from 'react-native';
import type { DeepLinkData, DeepLinkCallback } from './types';

export class DeepLinkHandler {
  private callback: DeepLinkCallback | null = null;
  private baseUrl: string | null = null;

  /**
   * Initialize deep link listener
   */
  initialize(baseUrl: string, callback: DeepLinkCallback): void {
    this.baseUrl = baseUrl;
    this.callback = callback;

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
   * Handle incoming deep link
   */
  private handleDeepLink = ({ url }: { url: string }): void => {
    if (!this.callback || !url) {
      return;
    }

    const deepLinkData = this.parseURL(url);
    this.callback(url, deepLinkData);
  };

  /**
   * Parse deep link URL and extract data
   */
  parseURL(url: string): DeepLinkData | null {
    try {
      const parsedUrl = new URL(url);

      // Check if this is a LinkForty URL
      if (this.baseUrl && !url.startsWith(this.baseUrl)) {
        return null;
      }

      // Extract short code from path
      const shortCode = parsedUrl.pathname.replace('/', '');

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
