# LinkForty React Native SDK

Official React Native SDK for [LinkForty](https://github.com/linkforty/core) - Open-source deep linking and mobile attribution platform.

## Features

- ✅ **Deferred Deep Linking** - Route new users to specific content after install
- ✅ **Direct Deep Linking** - Handle Universal Links (iOS) and App Links (Android)
- ✅ **Probabilistic Attribution** - Match installs to clicks with 70%+ confidence
- ✅ **Event Tracking** - Track in-app events with attribution
- ✅ **Privacy-Focused** - No persistent device IDs required
- ✅ **TypeScript Support** - Full type definitions included
- ✅ **Works with Core & Cloud** - Compatible with self-hosted and Cloud instances

## Installation

```bash
npm install @linkforty/react-native-sdk
# or
yarn add @linkforty/react-native-sdk
```

### Requirements

- React Native >= 0.64.0
- React >= 17.0.0
- Node.js >= 20.0.0

### Additional Dependencies

This SDK requires the following peer dependencies:

```bash
npm install @react-native-async-storage/async-storage react-native-device-info
```

### iOS Setup

1. Install CocoaPods dependencies:

```bash
cd ios && pod install
```

2. Configure Universal Links in Xcode:
   - Open your project in Xcode
   - Select your app target → Signing & Capabilities
   - Add "Associated Domains" capability
   - Add domain: `applinks:go.yourdomain.com` (replace with your LinkForty or custom domain)

3. Create AASA file on your server at:
   ```
   https://go.yourdomain.com/.well-known/apple-app-site-association
   ```

   Example AASA file:
   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appID": "TEAM_ID.com.yourapp.bundle",
           "paths": ["*"]
         }
       ]
     }
   }
   ```

### Android Setup

1. Configure App Links in `android/app/src/main/AndroidManifest.xml`:

```xml
<activity android:name=".MainActivity">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" />
    <data android:host="go.yourdomain.com" />
  </intent-filter>
</activity>
```

2. Create Digital Asset Links file on your server at:
   ```
   https://go.yourdomain.com/.well-known/assetlinks.json
   ```

   Example assetlinks.json:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.yourapp",
       "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
     }
   }]
   ```

## Quick Start

```typescript
import LinkForty from '@linkforty/react-native-sdk';

// Initialize SDK (call in App.tsx or index.js)
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  apiKey: 'optional-for-cloud-users', // Optional
  debug: __DEV__, // Enable debug logging in development
});

// Handle deferred deep links (new installs)
LinkForty.onDeferredDeepLink((deepLinkData) => {
  if (deepLinkData) {
    // User clicked a link before installing
    console.log('Deferred deep link:', deepLinkData);

    // Navigate to specific content
    navigation.navigate('Product', {
      id: deepLinkData.utmParameters?.content
    });
  } else {
    // Organic install (no link clicked)
    console.log('Organic install');
  }
});

// Handle direct deep links (existing users)
LinkForty.onDeepLink((url, deepLinkData) => {
  console.log('Deep link opened:', url, deepLinkData);

  if (deepLinkData) {
    // Navigate to specific content
    navigation.navigate('Product', {
      id: deepLinkData.utmParameters?.content
    });
  }
});

// Track in-app events
await LinkForty.trackEvent('purchase', {
  amount: 99.99,
  currency: 'USD',
  productId: 'premium_plan'
});
```

## API Reference

### `init(config: LinkFortyConfig): Promise<void>`

Initialize the SDK. Must be called before using any other methods.

**Parameters:**

- `config.baseUrl` (string, required) - Base URL of your LinkForty instance
- `config.apiKey` (string, optional) - API key for Cloud authentication
- `config.debug` (boolean, optional) - Enable debug logging
- `config.attributionWindow` (number, optional) - Attribution window in days (default: 7)

**Example:**

```typescript
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  debug: true,
  attributionWindow: 7,
});
```

### `onDeferredDeepLink(callback: (deepLinkData: DeepLinkData | null) => void): void`

Register a callback for deferred deep links. Called when the app is launched for the first time after installation.

**Parameters:**

- `callback` - Function called with deep link data or `null` for organic installs

**Example:**

```typescript
LinkForty.onDeferredDeepLink((deepLinkData) => {
  if (deepLinkData) {
    // Attributed install
    console.log('User came from:', deepLinkData.utmParameters?.source);
  } else {
    // Organic install
    console.log('Organic install');
  }
});
```

### `onDeepLink(callback: (url: string, deepLinkData: DeepLinkData | null) => void): void`

Register a callback for direct deep links. Called when the app is opened via a Universal Link (iOS) or App Link (Android).

**Parameters:**

- `callback` - Function called with the full URL and parsed deep link data

**Example:**

```typescript
LinkForty.onDeepLink((url, deepLinkData) => {
  if (deepLinkData?.shortCode) {
    // Navigate based on link
    navigation.navigate('Details', { id: deepLinkData.shortCode });
  }
});
```

### `trackEvent(name: string, properties?: Record<string, any>): Promise<void>`

Track an in-app event with optional properties.

**Parameters:**

- `name` - Event name (e.g., 'purchase', 'signup', 'add_to_cart')
- `properties` - Optional event properties

**Example:**

```typescript
await LinkForty.trackEvent('purchase', {
  amount: 99.99,
  currency: 'USD',
  productId: 'premium_plan',
  category: 'subscription'
});
```

### `getInstallData(): Promise<DeepLinkData | null>`

Get cached install attribution data.

**Returns:** Deep link data from install or `null` if not attributed

**Example:**

```typescript
const installData = await LinkForty.getInstallData();
if (installData) {
  console.log('Install source:', installData.utmParameters?.source);
}
```

### `getInstallId(): Promise<string | null>`

Get the unique install ID for this app installation.

**Returns:** Install ID or `null` if not available

**Example:**

```typescript
const installId = await LinkForty.getInstallId();
console.log('Install ID:', installId);
```

### `clearData(): Promise<void>`

Clear all cached SDK data. Useful for testing.

**Example:**

```typescript
await LinkForty.clearData();
// App will behave as if it's a fresh install
```

## TypeScript Types

### `DeepLinkData`

```typescript
interface DeepLinkData {
  shortCode: string;
  iosUrl?: string;
  androidUrl?: string;
  webUrl?: string;
  utmParameters?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  customParameters?: Record<string, string>;
  clickedAt?: string;
  linkId?: string;
}
```

### `LinkFortyConfig`

```typescript
interface LinkFortyConfig {
  baseUrl: string;
  apiKey?: string;
  debug?: boolean;
  attributionWindow?: number;
}
```

## Advanced Usage

### Testing Deferred Deep Linking

1. **Uninstall the app** or clear all data:
   ```typescript
   await LinkForty.clearData();
   ```

2. **Click a LinkForty link** on your device (in Safari/Chrome, not in the app)

3. **Install/Open the app** from App Store/Play Store

4. **Check logs** - you should see attribution data in the `onDeferredDeepLink` callback

### Using with Self-Hosted LinkForty Core

```typescript
// Point to your self-hosted instance
await LinkForty.init({
  baseUrl: 'http://localhost:3000', // or your domain
  debug: true,
});
```

### Using with LinkForty Cloud

```typescript
// Add API key for Cloud authentication
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  apiKey: 'your-api-key-here',
  debug: false,
});
```

### Custom Attribution Window

```typescript
// Change attribution window to 14 days
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  attributionWindow: 14, // days
});
```

## Troubleshooting

### Deep links not working on iOS

1. Verify your AASA file is accessible at `https://go.yourdomain.com/.well-known/apple-app-site-association`
2. Check that your Team ID and Bundle ID are correct
3. Make sure "Associated Domains" capability is added in Xcode
4. Test with a real device (Universal Links don't work in simulator)

### Deep links not working on Android

1. Verify your assetlinks.json file is accessible at `https://go.yourdomain.com/.well-known/assetlinks.json`
2. Check that your package name and SHA256 fingerprint are correct
3. Run `adb shell pm get-app-links com.yourapp` to verify link verification status
4. Make sure `android:autoVerify="true"` is set in your intent filter

### Deferred deep links not attributing

1. Make sure you're testing on first install (or call `clearData()`)
2. Check debug logs for fingerprint data
3. Verify your LinkForty backend is receiving the install event
4. Ensure the click and install happen within the attribution window (default: 7 days)
5. Try clicking the link and installing from the same network

### TypeScript errors

Make sure you have the latest type definitions installed:

```bash
npm install --save-dev @types/react @types/react-native
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- **Documentation:** Coming soon (self-hosting guide available in Core repository)
- **Issues:** [Report on GitHub](https://github.com/linkforty/react-native-sdk/issues)
- **Questions:** Open a GitHub Discussion or Issue

## Related Projects

- [LinkForty Cloud](https://linkforty.com) - Cloud platform with dashboard and API
- [LinkForty Core](https://github.com/linkforty/core) - Self-hosted open-source backend
- **iOS SDK** - Native Swift SDK (planned for future release)
- **Android SDK** - Native Kotlin SDK (planned for future release)

---

Made with ❤️ by the LinkForty team
