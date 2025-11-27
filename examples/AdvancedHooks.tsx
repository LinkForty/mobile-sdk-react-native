/**
 * Advanced Hooks Example
 *
 * This example shows how to create custom React hooks for
 * LinkForty SDK integration with TypeScript.
 */

import { useEffect, useState, useCallback } from 'react';
import LinkForty from '@linkforty/react-native-sdk';
import type { DeepLinkData } from '@linkforty/react-native-sdk';

/**
 * Custom hook for managing LinkForty SDK initialization
 */
export function useLinkForty(config: {
  baseUrl: string;
  apiKey?: string;
  debug?: boolean;
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await LinkForty.init(config);
        setIsInitialized(true);
      } catch (err) {
        setError(err as Error);
      }
    };

    init();
  }, [config.baseUrl, config.apiKey]);

  return { isInitialized, error };
}

/**
 * Custom hook for handling install attribution (deferred deep links)
 */
export function useInstallAttribution(
  onAttribution?: (data: DeepLinkData) => void
) {
  const [installData, setInstallData] = useState<DeepLinkData | null>(null);
  const [isOrganic, setIsOrganic] = useState<boolean | null>(null);

  useEffect(() => {
    LinkForty.onDeferredDeepLink((data) => {
      if (data) {
        setInstallData(data);
        setIsOrganic(false);
        onAttribution?.(data);
      } else {
        setIsOrganic(true);
      }
    });
  }, [onAttribution]);

  return { installData, isOrganic };
}

/**
 * Custom hook for handling deep links
 */
export function useDeepLink(
  onDeepLink?: (url: string, data: DeepLinkData | null) => void
) {
  const [currentDeepLink, setCurrentDeepLink] = useState<{
    url: string;
    data: DeepLinkData | null;
  } | null>(null);

  useEffect(() => {
    LinkForty.onDeepLink((url, data) => {
      setCurrentDeepLink({ url, data });
      onDeepLink?.(url, data);
    });
  }, [onDeepLink]);

  return currentDeepLink;
}

/**
 * Custom hook for tracking events with error handling
 */
export function useEventTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const trackEvent = useCallback(
    async (name: string, properties?: Record<string, any>) => {
      setIsTracking(true);
      setLastError(null);

      try {
        await LinkForty.trackEvent(name, properties);
      } catch (error) {
        setLastError(error as Error);
        throw error;
      } finally {
        setIsTracking(false);
      }
    },
    []
  );

  return { trackEvent, isTracking, lastError };
}

/**
 * Example: Using the hooks in a component
 */
export default function ExampleComponent() {
  // Initialize SDK
  const { isInitialized, error } = useLinkForty({
    baseUrl: 'https://go.yourdomain.com',
    debug: __DEV__,
  });

  // Handle install attribution
  const { installData, isOrganic } = useInstallAttribution((data) => {
    console.log('User came from:', data.utmParameters?.source);
  });

  // Handle deep links
  const deepLink = useDeepLink((url, data) => {
    console.log('Deep link opened:', url);
    // Navigate to specific screen
  });

  // Event tracking
  const { trackEvent, isTracking } = useEventTracking();

  // Track screen view
  useEffect(() => {
    if (isInitialized) {
      trackEvent('screen_view', {
        screen_name: 'Home',
        timestamp: new Date().toISOString(),
      });
    }
  }, [isInitialized]);

  const handlePurchase = async () => {
    try {
      await trackEvent('purchase', {
        amount: 99.99,
        currency: 'USD',
        product_id: 'premium_plan',
      });
      alert('Purchase tracked!');
    } catch (error) {
      console.error('Failed to track purchase:', error);
    }
  };

  if (error) {
    return <Text>SDK initialization failed: {error.message}</Text>;
  }

  if (!isInitialized) {
    return <Text>Initializing LinkForty SDK...</Text>;
  }

  return (
    <View>
      <Text>SDK Initialized!</Text>

      {isOrganic !== null && (
        <Text>
          Install Type: {isOrganic ? 'Organic' : 'Attributed'}
        </Text>
      )}

      {installData && (
        <View>
          <Text>Source: {installData.utmParameters?.source}</Text>
          <Text>Campaign: {installData.utmParameters?.campaign}</Text>
        </View>
      )}

      {deepLink && (
        <Text>Current Deep Link: {deepLink.url}</Text>
      )}

      <Button
        title={isTracking ? 'Tracking...' : 'Track Purchase'}
        onPress={handlePurchase}
        disabled={isTracking}
      />
    </View>
  );
}

/**
 * TypeScript Utility Types
 */

// Extract UTM parameters with defaults
export function getUTMParameters(data: DeepLinkData | null) {
  return {
    source: data?.utmParameters?.source || 'unknown',
    medium: data?.utmParameters?.medium || 'unknown',
    campaign: data?.utmParameters?.campaign || 'none',
    term: data?.utmParameters?.term,
    content: data?.utmParameters?.content,
  };
}

// Check if install is attributed to a specific campaign
export function isFromCampaign(
  data: DeepLinkData | null,
  campaignName: string
): boolean {
  return data?.utmParameters?.campaign === campaignName;
}

// Get install age in days
export async function getInstallAge(): Promise<number | null> {
  const installData = await LinkForty.getInstallData();
  if (!installData?.clickedAt) return null;

  const clickDate = new Date(installData.clickedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - clickDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}
