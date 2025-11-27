/**
 * Basic Setup Example
 *
 * This example shows the minimal setup required to integrate
 * LinkForty SDK into a React Native app.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LinkForty from '@linkforty/react-native-sdk';
import { useNavigation } from '@react-navigation/native';

export default function App() {
  const navigation = useNavigation();

  useEffect(() => {
    // Initialize SDK on app launch
    initializeLinkForty();
  }, []);

  const initializeLinkForty = async () => {
    try {
      // Initialize with your LinkForty instance URL
      await LinkForty.init({
        baseUrl: 'https://go.yourdomain.com',
        debug: __DEV__, // Enable debug logging in development
      });

      console.log('LinkForty SDK initialized successfully');

      // Handle deferred deep links (new installs)
      LinkForty.onDeferredDeepLink((deepLinkData) => {
        if (deepLinkData) {
          console.log('User installed from link:', deepLinkData);

          // Example: Navigate to a specific product
          if (deepLinkData.customParameters?.productId) {
            navigation.navigate('Product', {
              id: deepLinkData.customParameters.productId,
            });
          }
        } else {
          console.log('Organic install - no attribution');
        }
      });

      // Handle direct deep links (existing users)
      LinkForty.onDeepLink((url, deepLinkData) => {
        console.log('Deep link opened:', url);

        if (deepLinkData) {
          // Navigate based on deep link data
          handleDeepLink(deepLinkData);
        }
      });
    } catch (error) {
      console.error('Failed to initialize LinkForty:', error);
    }
  };

  const handleDeepLink = (deepLinkData) => {
    // Example: Route to different screens based on UTM parameters
    const { utmParameters, customParameters } = deepLinkData;

    if (customParameters?.productId) {
      navigation.navigate('Product', { id: customParameters.productId });
    } else if (customParameters?.category) {
      navigation.navigate('Category', { name: customParameters.category });
    } else if (utmParameters?.campaign === 'summer-sale') {
      navigation.navigate('Sale');
    } else {
      navigation.navigate('Home');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LinkForty Example App</Text>
      <Text style={styles.subtitle}>Check console for deep link logs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
