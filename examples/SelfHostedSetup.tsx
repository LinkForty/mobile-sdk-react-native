/**
 * Self-Hosted LinkForty Core Setup Example
 *
 * This example shows how to use the SDK with a self-hosted
 * LinkForty Core instance.
 */

import React, { useEffect } from 'react';
import LinkForty from '@linkforty/react-native-sdk';

export default function App() {
  useEffect(() => {
    initializeSelfHosted();
  }, []);

  const initializeSelfHosted = async () => {
    try {
      // Option 1: Local Development
      await LinkForty.init({
        baseUrl: 'http://192.168.1.100:3000', // Your local machine IP
        debug: true,
        attributionWindow: 7, // 7 days
      });

      // Option 2: Self-Hosted Production
      // await LinkForty.init({
      //   baseUrl: 'https://links.yourcompany.com',
      //   debug: false,
      //   attributionWindow: 14, // 14 days
      // });

      // Option 3: Self-Hosted with Custom Domain
      // await LinkForty.init({
      //   baseUrl: 'https://go.yourapp.com',
      //   debug: false,
      // });

      console.log('Connected to self-hosted LinkForty instance');

      // Set up deep link handlers
      setupDeepLinkHandlers();
    } catch (error) {
      console.error('Failed to connect to self-hosted instance:', error);
    }
  };

  const setupDeepLinkHandlers = () => {
    LinkForty.onDeferredDeepLink((deepLinkData) => {
      if (deepLinkData) {
        console.log('Attribution data:', {
          source: deepLinkData.utmParameters?.source,
          medium: deepLinkData.utmParameters?.medium,
          campaign: deepLinkData.utmParameters?.campaign,
        });

        // Track install with custom properties
        trackCustomInstall(deepLinkData);
      }
    });

    LinkForty.onDeepLink((url, deepLinkData) => {
      console.log('Deep link URL:', url);
      console.log('Deep link data:', deepLinkData);
    });
  };

  const trackCustomInstall = async (deepLinkData) => {
    try {
      // Track install event with custom attribution data
      await LinkForty.trackEvent('app_install', {
        source: deepLinkData.utmParameters?.source || 'organic',
        medium: deepLinkData.utmParameters?.medium || 'none',
        campaign: deepLinkData.utmParameters?.campaign || 'none',
        click_id: deepLinkData.linkId,
        timestamp: new Date().toISOString(),
      });

      console.log('Install tracked on self-hosted instance');
    } catch (error) {
      console.error('Failed to track install:', error);
    }
  };

  return null; // Your app UI
}

/**
 * Docker Compose Setup for Self-Hosting
 *
 * To run LinkForty Core locally with Docker:
 *
 * 1. Create docker-compose.yml:
 *
 * ```yaml
 * version: '3.8'
 * services:
 *   linkforty:
 *     image: linkforty/linkforty:latest
 *     ports:
 *       - "3000:3000"
 *     environment:
 *       DATABASE_URL: postgresql://postgres:password@postgres:5432/linkforty
 *       REDIS_URL: redis://redis:6379
 *   postgres:
 *     image: postgres:15-alpine
 *     environment:
 *       POSTGRES_DB: linkforty
 *       POSTGRES_PASSWORD: password
 *   redis:
 *     image: redis:7-alpine
 * ```
 *
 * 2. Start services:
 * ```bash
 * docker-compose up -d
 * ```
 *
 * 3. Access at http://localhost:3000
 *
 * 4. Update SDK to point to your local IP:
 * ```typescript
 * await LinkForty.init({
 *   baseUrl: 'http://192.168.1.100:3000'
 * });
 * ```
 */
