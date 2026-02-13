# LinkForty React Native SDK

Official React Native SDK for [LinkForty](https://github.com/linkforty/core) - Open-source deep linking and mobile attribution platform.

## Features

- **Direct Deep Linking** - Handle Universal Links (iOS) and App Links (Android) with automatic server-side resolution
- **Deferred Deep Linking** - Route new users to specific content after install
- **Link Creation** - Create short links programmatically from your app
- **Probabilistic Attribution** - Match installs to clicks via device fingerprinting
- **Event Tracking** - Track in-app events with attribution
- **Privacy-Focused** - No persistent device IDs required
- **TypeScript Support** - Full type definitions included
- **Works with Core & Cloud** - Compatible with self-hosted and Cloud instances

## Installation

```bash
npm install @linkforty/mobile-sdk-react-native
```

### Requirements

- React Native >= 0.64.0
- React >= 17.0.0
- Node.js >= 20.0.0

### Peer Dependencies

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
   - Select your app target > Signing & Capabilities
   - Add "Associated Domains" capability
   - Add domain: `applinks:go.yourdomain.com` (replace with your LinkForty domain)

3. Host an Apple App Site Association (AASA) file at:
   ```
   https://go.yourdomain.com/.well-known/apple-app-site-association
   ```

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

1. Add an App Links intent filter in `android/app/src/main/AndroidManifest.xml`:

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

2. Host a Digital Asset Links file at:
   ```
   https://go.yourdomain.com/.well-known/assetlinks.json
   ```

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

3. Ensure `MainActivity` preserves the Intent for React Native. In `MainActivity.kt`:

```kotlin
override fun onNewIntent(intent: Intent) {
    setIntent(intent) // Required for React Native's Linking.getInitialURL()
    super.onNewIntent(intent)
}
```

> **Note:** If you use other SDKs that consume Intent data (e.g., CleverTap), make sure they receive a **copy** of the URI in `onCreate` rather than consuming the original Intent, otherwise `Linking.getInitialURL()` may return `null`.

## Quick Start

```typescript
import LinkForty from '@linkforty/mobile-sdk-react-native';

// 1. Initialize the SDK (call once at app startup)
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  apiKey: 'your-api-key', // Required for createLink(), optional otherwise
  debug: __DEV__,
});

// 2. Handle direct deep links (user taps a link while app is installed)
LinkForty.onDeepLink((url, data) => {
  if (data?.customParameters) {
    const { route, id } = data.customParameters;
    // Navigate to the target screen
    navigation.navigate(route, { id });
  }
});

// 3. Handle deferred deep links (user installs app after tapping a link)
LinkForty.onDeferredDeepLink((data) => {
  if (data?.customParameters) {
    const { route, id } = data.customParameters;
    navigation.navigate(route, { id });
  } else {
    console.log('Organic install — no link clicked');
  }
});
```

## API Reference

### `init(config)`

Initialize the SDK. Must be called before any other method.

```typescript
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com', // Required
  apiKey: 'your-api-key',               // Optional (required for createLink)
  debug: true,                           // Optional (default: false)
  attributionWindow: 7,                  // Optional, in days (default: 7)
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `baseUrl` | `string` | Yes | Base URL of your LinkForty instance |
| `apiKey` | `string` | No | API key for authenticated endpoints (Cloud) |
| `debug` | `boolean` | No | Enable debug logging |
| `attributionWindow` | `number` | No | Attribution window in days (default: 7) |

---

### `onDeepLink(callback)`

Listen for direct deep links. Called when the app is opened via a Universal Link (iOS) or App Link (Android).

When the URL matches your LinkForty `baseUrl`, the SDK automatically resolves it via the server to retrieve the full link data including `customParameters`, UTM parameters, and metadata. If resolution fails, the SDK falls back to local URL parsing.

```typescript
LinkForty.onDeepLink((url: string, data: DeepLinkData | null) => {
  console.log('Link URL:', url);

  if (data?.customParameters) {
    const { route, id } = data.customParameters;
    navigation.navigate(route, { id });
  }
});
```

| Callback Parameter | Type | Description |
|--------------------|------|-------------|
| `url` | `string` | The full URL that opened the app |
| `data` | `DeepLinkData \| null` | Parsed link data, or `null` if parsing failed |

---

### `onDeferredDeepLink(callback)`

Listen for deferred deep links. Called on first launch after install if the user clicked a LinkForty link before installing.

```typescript
LinkForty.onDeferredDeepLink((data: DeepLinkData | null) => {
  if (data) {
    // Attributed install — user clicked a link before installing
    console.log('Came from:', data.utmParameters?.source);
    const { route, id } = data.customParameters || {};
    if (route) navigation.navigate(route, { id });
  } else {
    // Organic install or attribution failed
    console.log('Organic install');
  }
});
```

| Callback Parameter | Type | Description |
|--------------------|------|-------------|
| `data` | `DeepLinkData \| null` | Attributed link data, or `null` for organic installs |

---

### `createLink(options)`

Create a short link programmatically. Requires `apiKey` to be set in `init()`.

When `templateId` is omitted, the server auto-selects your organization's default template.

```typescript
const result = await LinkForty.createLink({
  deepLinkParameters: { route: 'VIDEO_VIEWER', id: 'e4338ed6-...' },
  title: 'Check out this video',
  utmParameters: { source: 'share', medium: 'app' },
});

console.log(result.url);       // https://go.yourdomain.com/tmpl/abc123
console.log(result.shortCode); // abc123
console.log(result.linkId);    // uuid
```

**Options:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deepLinkParameters` | `Record<string, string>` | No | Custom parameters embedded in the link (e.g., `{ route, id }`) |
| `title` | `string` | No | Link title for internal reference |
| `description` | `string` | No | Link description |
| `customCode` | `string` | No | Custom short code (auto-generated if omitted) |
| `utmParameters` | `object` | No | UTM parameters (`source`, `medium`, `campaign`, `term`, `content`) |
| `templateId` | `string` | No | Template UUID (auto-selected if omitted) |
| `templateSlug` | `string` | No | Template slug (only needed with `templateId`) |

**Returns:** `CreateLinkResult`

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | Full shareable URL |
| `shortCode` | `string` | The generated short code |
| `linkId` | `string` | Link UUID |

---

### `trackEvent(name, properties?)`

Track an in-app event for attribution analytics. Requires a successful install report (automatic on first launch).

```typescript
await LinkForty.trackEvent('purchase', {
  amount: 99.99,
  currency: 'USD',
  productId: 'premium_plan',
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Event name (e.g., `'purchase'`, `'signup'`) |
| `properties` | `Record<string, any>` | No | Arbitrary event properties |

---

### `getInstallData()`

Retrieve cached install attribution data from a previous deferred deep link.

```typescript
const data = await LinkForty.getInstallData();
if (data) {
  console.log('Install attributed to:', data.utmParameters?.source);
}
```

**Returns:** `DeepLinkData | null`

---

### `getInstallId()`

Get the unique install ID assigned by the LinkForty server on first launch.

```typescript
const installId = await LinkForty.getInstallId();
```

**Returns:** `string | null`

---

### `clearData()`

Clear all cached SDK data (install ID, attribution data, first-launch flag). The next app launch will behave as a fresh install.

```typescript
await LinkForty.clearData();
```

## Types

### `DeepLinkData`

```typescript
interface DeepLinkData {
  shortCode: string;
  customParameters?: Record<string, string>;
  utmParameters?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  iosUrl?: string;
  androidUrl?: string;
  webUrl?: string;
  deepLinkPath?: string;
  appScheme?: string;
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

### `CreateLinkOptions`

```typescript
interface CreateLinkOptions {
  templateId?: string;
  templateSlug?: string;
  deepLinkParameters?: Record<string, string>;
  title?: string;
  description?: string;
  customCode?: string;
  utmParameters?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}
```

### `CreateLinkResult`

```typescript
interface CreateLinkResult {
  url: string;
  shortCode: string;
  linkId: string;
}
```

## How Deep Linking Works

### Direct Deep Links (App Installed)

When a user taps a LinkForty URL and the app is already installed:

1. The OS intercepts the URL via App Links (Android) or Universal Links (iOS) and opens your app directly
2. The SDK receives the URL via React Native's `Linking` API
3. The SDK calls your LinkForty server's resolve endpoint to retrieve the full link data (`customParameters`, UTM params, etc.)
4. Your `onDeepLink` callback fires with the resolved data
5. Your app navigates to the target screen

### Deferred Deep Links (App Not Installed)

When a user taps a LinkForty URL and the app is **not** installed:

1. The LinkForty server records a click with the user's device fingerprint
2. The user is redirected to the App Store / Play Store
3. After installing and opening the app, the SDK reports the install with the device's fingerprint
4. The server matches the fingerprint to the original click (probabilistic attribution)
5. Your `onDeferredDeepLink` callback fires with the matched link data
6. Your app navigates to the content the user originally clicked on

## Troubleshooting

### Deep links not working on iOS

1. Verify AASA file is accessible at `https://yourdomain.com/.well-known/apple-app-site-association`
2. Check that Team ID and Bundle ID are correct in the AASA file
3. Confirm "Associated Domains" capability is added in Xcode with `applinks:yourdomain.com`
4. Test on a real device (Universal Links don't work in the simulator)

### Deep links not working on Android

1. Verify assetlinks.json is accessible at `https://yourdomain.com/.well-known/assetlinks.json`
2. Check package name and SHA256 fingerprint are correct
3. Run `adb shell pm get-app-links com.yourapp` to check link verification status
4. Confirm `android:autoVerify="true"` is set in your intent filter
5. Ensure `MainActivity` calls `setIntent(intent)` in `onNewIntent` (see [Android Setup](#android-setup))

### `getInitialURL()` returns null on Android

This usually means another SDK or library is consuming the Intent data before React Native reads it. In `MainActivity.kt`:

- Call `setIntent(intent)` in `onNewIntent` so React Native sees the updated Intent on warm starts
- If using CleverTap or similar SDKs, pass a **copy** of the URI to them in `onCreate` rather than the original Intent data

### Deferred deep links not attributing

1. Confirm this is a first install (or call `clearData()` first)
2. Enable `debug: true` and check logs for fingerprint data
3. Verify your LinkForty server received the install event
4. Ensure the click and install happen within the attribution window (default: 7 days)
5. Test on the same network for best fingerprint match accuracy

### TypeScript errors

Ensure peer dependencies are installed:

```bash
npm install --save-dev @types/react @types/react-native
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues:** [GitHub Issues](https://github.com/linkforty/react-native-sdk/issues)
- **Documentation:** [LinkForty Core](https://github.com/linkforty/core)

## Related Projects

- [LinkForty Cloud](https://linkforty.com) - Cloud platform with dashboard and API
- [LinkForty Core](https://github.com/linkforty/core) - Self-hosted open-source backend
