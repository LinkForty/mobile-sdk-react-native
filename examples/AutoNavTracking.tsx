/**
 * Automatic Navigation Tracking
 *
 * With `autoTrackNavigation`, the SDK emits a `screen_view` event every time the
 * user navigates — no manual per-screen calls. Because screen views flow through
 * the normal event pipeline, they're automatically attributed to the deep link
 * that drove the visit, so your LinkForty dashboard can show an *attributed*
 * screen-flow funnel per campaign (which link → which screens → which events).
 *
 * Setup is one-time:
 *   1. Create a navigation ref with `createNavigationContainerRef()`.
 *   2. Pass it to BOTH `<NavigationContainer ref={...}>` and `LinkForty.init`.
 *   3. Set `autoTrackNavigation: true`.
 *
 * Apps that don't use React Navigation simply omit `navigationRef` — nothing
 * else changes and there is no required dependency.
 */

import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LinkForty from '@linkforty/mobile-sdk-react-native';

// A single ref shared between React Navigation and LinkForty.
export const navigationRef = createNavigationContainerRef();

const Stack = createNativeStackNavigator();

function HomeScreen() {
  return (
    <View>
      <Text>Home</Text>
    </View>
  );
}

function ProductScreen() {
  return (
    <View>
      <Text>Product</Text>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    LinkForty.init({
      baseUrl: 'https://go.yourdomain.com',
      appToken: 'at_your_workspace_token', // Cloud: attributes organic installs
      autoTrackNavigation: true, // <-- auto-emit screen_view on navigation
      navigationRef, // <-- the same ref passed to NavigationContainer
      debug: __DEV__,
    }).catch((error) => {
      console.error('Failed to initialize LinkForty:', error);
    });
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Product" component={ProductScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * Notes
 * -----
 * - `screen_view` events carry the active deep-link attribution + a session id,
 *   so re-engagement campaigns (a link tapped by an already-installed user) are
 *   attributed to the link they tapped — not their original install link.
 * - Route params are captured with a PII-safe default: only primitive values are
 *   kept, long strings are truncated, and keys that look like PII (email, token,
 *   phone, …) are dropped. Your custom events (e.g. `add_to_cart`, `purchase`)
 *   are attributed the same way — keep calling `LinkForty.trackEvent(...)` as usual.
 */
