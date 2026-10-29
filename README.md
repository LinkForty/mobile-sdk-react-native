# LinkForty React Native SDK

React Native SDK for [LinkForty](https://github.com/LinkForty/core) — the open-source alternative to Branch.io, AppsFlyer OneLink, and Firebase Dynamic Links. Add deferred deep linking, mobile attribution, and smart link routing to your React Native app. Self-hosted, privacy-first, no per-click pricing.

[![npm version](https://img.shields.io/npm/v/@linkforty/mobile-sdk-react-native.svg)](https://www.npmjs.com/package/@linkforty/mobile-sdk-react-native)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Direct Deep Linking** - Handle Universal Links (iOS) and App Links (Android) with automatic server-side resolution
- **Deferred Deep Linking** - Route new users to specific content after install
- **Link Creation** - Create short links programmatically from your app
- **Install Attribution** - Match installs to clicks exactly from the Google Play install referrer on Android, and otherwise via device fingerprinting
- **Event Tracking** - Track in-app events with attribution
- **Privacy-Focused** - No advertising IDs (IDFA/GAID) and no App Tracking Transparency prompt (see [Data collected](#data-collected))
- **TypeScript Support** - Full type definitions included
- **Works with self-hosted Core and the hosted service** - Same SDK, different `baseUrl`

## Installation

```bash
npm install @linkforty/mobile-sdk-react-native
```

### Requirements

- React Native >= 0.65.0 (the floor set by `@react-native-async-storage/async-storage` 2.x)
- React >= 17.0.0
- Node.js >= 20.0.0

### Native dependencies

The SDK uses two native modules, which are peer dependencies: install them in your app, which then has a single copy of each that the SDK shares.

```bash
npm install @react-native-async-storage/async-storage react-native-device-info
```

- `@react-native-async-storage/async-storage` 2.2 or later, or 3.x. With 3.x the SDK uses its default (legacy) storage, which keeps the data written with 2.x, so upgrading AsyncStorage keeps the install ID. AsyncStorage 3.x has its own native requirements (for example Android `minSdk` 24 and a recent Kotlin Gradle plugin); stay on 2.x if your app can't meet them.
- `react-native-device-info` 15.x.

React Native's autolinking only links native modules listed in your app's own `package.json`, so without this step their native code is not built into the app.

Only if you use [automatic screen tracking](#automatic-screen-tracking-autotracknavigation) (`autoTrackNavigation`), install React Navigation — it's an **optional** peer dependency and not required otherwise:

```bash
npm install @react-navigation/native
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
   - Add domain: `applinks:go.yourdomain.com` (replace with your link host; add one entry per host your links use)

3. **Forward incoming links to React Native in your `AppDelegate`.** Without this, iOS opens your app from a Universal Link but JavaScript never receives the URL, so `onDeepLink` never fires. Add both methods: the first handles URL-scheme links, the second Universal Links.

   In `AppDelegate.swift`:

   ```swift
   import React // for RCTLinkingManager

   func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
     return RCTLinkingManager.application(app, open: url, options: options)
   }

   func application(
     _ application: UIApplication,
     continue userActivity: NSUserActivity,
     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
   ) -> Bool {
     return RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
   }
   ```

   Or in `AppDelegate.mm`:

   ```objc
   #import <React/RCTLinkingManager.h>

   - (BOOL)application:(UIApplication *)application
               openURL:(NSURL *)url
               options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
   {
     return [RCTLinkingManager application:application openURL:url options:options];
   }

   - (BOOL)application:(UIApplication *)application
       continueUserActivity:(nonnull NSUserActivity *)userActivity
         restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
   {
     return [RCTLinkingManager application:application
                      continueUserActivity:userActivity
                        restorationHandler:restorationHandler];
   }
   ```

   If your app uses a `SceneDelegate` (it declares `UIApplicationSceneManifest` in `Info.plist`), iOS delivers links to the scene instead, so forward them from the `SceneDelegate`. See React Native's [Linking guide](https://reactnative.dev/docs/linking).

4. The Apple App Site Association file is served by your LinkForty server at `https://go.yourdomain.com/.well-known/apple-app-site-association`; you don't host it yourself. On self-hosted [LinkForty Core](https://github.com/LinkForty/core), set the `IOS_TEAM_ID` and `IOS_BUNDLE_ID` environment variables; on the hosted service, enter your Team ID and bundle ID in the dashboard's app configuration. Check it with `curl https://go.yourdomain.com/.well-known/apple-app-site-association`.

### Android Setup

1. Add an App Links intent filter to your main activity in `android/app/src/main/AndroidManifest.xml`, with `android:launchMode="singleTask"` so a link opens the running app instead of a second copy of the activity:

```xml
<activity
  android:name=".MainActivity"
  android:launchMode="singleTask">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" />
    <data android:host="go.yourdomain.com" />
  </intent-filter>
</activity>
```

2. The Digital Asset Links file is served by your LinkForty server at `https://go.yourdomain.com/.well-known/assetlinks.json`; you don't host it yourself. On self-hosted LinkForty Core, set the `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_FINGERPRINTS` (comma-separated) environment variables; on the hosted service, enter your package name and signing-certificate SHA-256 fingerprints in the dashboard's app configuration.

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

// 1. Initialize the SDK (call once at app startup; steps 2 and 3 may follow without awaiting it)
await LinkForty.init({
  baseUrl: 'https://api.linkforty.com', // hosted service; or your own server's URL if you self-host
  appToken: 'at_a1b2c3d4...',           // Required on the hosted service
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

`onDeepLink()` and `onDeferredDeepLink()` may be called as soon as `init()` has been called, without awaiting it, so an app can register its link handler on the first frame while the install report is still in flight. `onDeepLink()` throws only if `init()` was never called. A link handled before the SDK has learned your workspace's link hosts waits for them, up to 3 seconds (not on later launches, which know them from the start).

## API Reference

### `init(config)`

Initialize the SDK. Must be called before any other method. Calling it a second time logs a warning and does nothing.

On the first launch it reports the install (and on Android waits up to 2 seconds for the Google Play install referrer) before it resolves. If the report fails (no connection, a server error), it is reported again on the next launch, and so on until the server accepts it; until then there is no install ID and `trackEvent()` sends nothing.

`init()` always settles. Every request the SDK makes is abandoned after `requestTimeoutMs` (default 10 seconds), since React Native sets no network timeout of its own on Android, and the device's user agent lookup is abandoned after 3 seconds in favor of a generated one. A network failure, a timeout or unavailable storage (the AsyncStorage native module not linked) is logged, never thrown: with unavailable storage the SDK behaves as on a first launch and keeps working for the session. The only error `init()` rejects with is one thrown by your own `onDeferredDeepLink` callback.

**Upgrading from 1.9.0 or earlier:** those versions never retried a failed first-launch install report, which left the device without an install ID, so its events were dropped. After the upgrade, such a device reports its install once. It appears as an install dated at the upgrade, usually organic, because the click that led to the original install is normally outside the attribution window by then. Devices that already have an install ID never report again. This recovery report only restores the install ID. It does not call `onDeferredDeepLink` (the user has been using the app, so routing them like a fresh install would be wrong). Any link it matches is not saved for `getInstallData()` and is not credited for later events: the match is made at upgrade time, not from the click that led to the install. A link the user taps to open the app is credited as usual.

```typescript
await LinkForty.init({
  baseUrl: 'https://api.linkforty.com', // Required
  appToken: 'at_a1b2c3d4...',           // Required on the hosted service
  apiKey: 'your-api-key',               // Optional (only needed for createLink)
  debug: true,                          // Optional (default: false)
  attributionWindow: 7,                 // Optional, in days (default: 7)
  requestTimeoutMs: 10000,              // Optional, in ms (default: 10000)
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `baseUrl` | `string` | Yes | `https://api.linkforty.com` on the hosted service; your server's URL if you self-host LinkForty Core |
| `appToken` | `string` | Hosted service: yes | Public workspace token, sent on every request. On the hosted service it scopes install matching and link lookups to your workspace, attributes organic installs (App Store discovery, social mentions, etc.) to it, and lets the SDK learn your workspace's link hosts. Find it in the dashboard under Settings → App Configuration. Format: `at_<32 hex chars>`. Safe to ship in your app bundle. |
| `apiKey` | `string` | No | API key, only needed for `createLink()`. It is a secret: don't ship one in your app unless you create links from it. |
| `debug` | `boolean` | No | Log what the SDK does, including link URLs and link data, to the console (default: `false`). The API key is never logged. Without `debug` the SDK logs only failures: a failed install report or event, `init()` called twice, and an event dropped for lack of an install ID. |
| `attributionWindow` | `number` | No | Attribution window in days (default: 7) |
| `requestTimeoutMs` | `number` | No | How long any request to the server may take before it is abandoned, in milliseconds (default: 10000). An abandoned install report is retried on the next launch. |
| `autoTrackNavigation` | `boolean \| { captureParams?: string[]; debounceMs?: number }` | No | Emit `screen_view` events from React Navigation. See [Automatic Screen Tracking](#automatic-screen-tracking-autotracknavigation). Default: off |
| `navigationRef` | `NavigationContainerRefLike` | With `autoTrackNavigation` | Your React Navigation container ref |

---

### `onDeepLink(callback)`

Listen for direct deep links. Called when the app is opened via a Universal Link (iOS) or App Link (Android). Calling `onDeepLink()` again replaces the callback: only the newest one is called, once per link.

When the URL is a LinkForty link, the SDK automatically resolves it via the server to retrieve the full link data including `customParameters`, UTM parameters, and metadata. If resolution fails, the SDK falls back to local URL parsing. Any other URL reaches the callback with `data` set to `null`.

A LinkForty link is an `http(s)` URL on your `baseUrl` host or, with `appToken` set, on one of your workspace's link hosts. The SDK learns those hosts from the server at launch (`GET /api/sdk/v1/link-domains`) and saves them for the next one. On the hosted service they are your workspace's `toapp.me` subdomain and verified custom domains, and with `appToken` set a lookup answers only with your own workspace's links. A server without that endpoint (such as self-hosted LinkForty Core) leaves the SDK looking up links on the `baseUrl` host only, so point `baseUrl` at the host your links use.

```typescript
import type { DeepLinkData } from '@linkforty/mobile-sdk-react-native';

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
| `data` | `DeepLinkData \| null` | Resolved link data, or `null` when the URL is not a LinkForty link or can't be parsed |

---

### `onDeferredDeepLink(callback)`

Listen for deferred deep links. Called once, on the launch that reports the install: with the link's data if the user clicked a LinkForty link before installing, or `null` for an organic install. A launch whose report fails also calls it with `null`, and the launch that later reports the install successfully calls it again with that report's result. The second argument says which of the three happened. The one-time report from a device upgraded from 1.9.0 or earlier (see [`init`](#initconfig)) does not call it. It can be registered before or after `init()`. Later launches don't call it; use `getInstallData()` for the install's link data.

```typescript
import type { DeepLinkData, DeferredDeepLinkResult } from '@linkforty/mobile-sdk-react-native';

LinkForty.onDeferredDeepLink((data: DeepLinkData | null, result: DeferredDeepLinkResult) => {
  if (data) {
    // Attributed install — user clicked a link before installing
    console.log('Came from:', data.utmParameters?.source);
    const { route, id } = data.customParameters || {};
    if (route) navigation.navigate(route, { id });
  } else if (result.status === 'failed') {
    // The report didn't reach the server; it is sent again on the next launch
    console.warn('Install report failed:', result.error);
  } else {
    console.log('Organic install');
  }
});
```

| Callback Parameter | Type | Description |
|--------------------|------|-------------|
| `data` | `DeepLinkData \| null` | Attributed link data, or `null` for an organic install or a failed report |
| `result` | `DeferredDeepLinkResult` | `{ status: 'attributed' \| 'organic' \| 'failed', error? }`. With `failed`, `error` is the failure (an `Error` with `status` for an HTTP error response, `code: 'timeout'` for an abandoned request) and the next launch reports again. A callback that takes only `data` keeps working. |

The deferred link also carries how certain the match is: `confidenceScore`, `matchedFactors`, `attributionMethod` and `competingLinks` (see [`DeepLinkData`](#deeplinkdata)). Before acting on a sensitive link, check `competingLinks`:

```typescript
LinkForty.onDeferredDeepLink((data) => {
  if (data?.customParameters?.route === 'SIGN_IN' && (data.competingLinks ?? 0) > 0) {
    // Another link was also in contention for this install: confirm with the user first
    return askUserToConfirm(data);
  }
  // ...
});
```

---

### `createLink(options)`

Create a short link programmatically. Requires `apiKey` to be set in `init()`.

When `templateId` is omitted, the SDK calls `POST /api/sdk/v1/links`, where the server auto-selects your organization's default template. That endpoint is on the hosted service; self-hosted LinkForty Core doesn't have it, so pass a `templateId` (and `templateSlug`) there, which uses `POST /api/links`.

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
| `externalUserId` | `string` | No | Your user ID for this link; overrides the value set with `setExternalUserId()` |

**Returns:** `CreateLinkResult`

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | Full shareable URL |
| `shortCode` | `string` | The generated short code |
| `linkId` | `string` | Link UUID |
| `deduplicated` | `boolean \| undefined` | `true` when the server returned an existing link for this user instead of creating one |

---

### `setExternalUserId(id)` / `getExternalUserId()`

Set your own user ID, attached to every `createLink()` call unless the call passes its own `externalUserId`. Pass `null` to clear it. It is kept in memory only, so set it again after each launch (for example after sign-in).

```typescript
LinkForty.setExternalUserId('user_123');
LinkForty.getExternalUserId(); // 'user_123'
```

---

### `trackEvent(name, properties?)`

Track an in-app event for attribution analytics. Requires a successful install report (automatic on first launch, and retried on later launches if it fails); without an install ID the call logs a warning and sends nothing.

Events are sent once, straight away. An event tracked while `init()` is still running is held (up to 100) and sent, with the time it was tracked, once `init()` has the install ID; if that launch's install report fails, the held events are dropped with one warning. There is no offline queue: an event that fails to send (no connection, server error) is logged and dropped, not retried.

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

> **Attribution:** every tracked event (including auto screen views) is automatically attributed to the deep link that drove the visit using a last-click model — so re-engagement campaigns (a link tapped by an already-installed user) are credited to the link they tapped, not their original install link.

---

### `trackRevenue(amount, currency, properties?)`

Track a revenue event. Sends an event named `revenue` with `revenue` and `currency` added to its properties, the convention every LinkForty SDK uses. Throws if `amount` is negative.

```typescript
await LinkForty.trackRevenue(29.99, 'USD', { productId: 'premium_plan', orderId: 'order-456' });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `amount` | `number` | Yes | Non-negative revenue amount |
| `currency` | `string` | Yes | ISO 4217 currency code (e.g. `'USD'`) |
| `properties` | `Record<string, any>` | No | Additional event properties |

---

### Automatic Screen Tracking (`autoTrackNavigation`)

Emit a `screen_view` event on every navigation — no manual per-screen calls — so your dashboard can show an **attributed screen-flow funnel** per campaign (which link → which screens → which events). This is opt-in and uses [React Navigation](https://reactnavigation.org/).

Pass your navigation ref to **both** `NavigationContainer` and `LinkForty.init`:

```typescript
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  autoTrackNavigation: true,
  navigationRef,
});

// <NavigationContainer ref={navigationRef}> ... </NavigationContainer>
```

- `@react-navigation/native` is an **optional** peer dependency. Apps that don't use it simply omit `navigationRef` — nothing changes and there's no required dependency.
- The ref from `createNavigationContainerRef()` type-checks as `navigationRef` with React Navigation 7, with or without a param list (`createNavigationContainerRef<RootStackParamList>()`).
- Each `screen_view` carries `screen` (the route name), `previousScreen` when there is one, and `params` only for allow-listed keys.
- Rapid transitions are debounced (`debounceMs`, default 350) and same-screen re-renders are deduped.
- **Route params are OFF by default** (privacy-safe): only the screen name is captured, since params can contain PII and the SDK runs inside your app. To capture specific non-PII params, opt in with an explicit allow-list:

```typescript
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  autoTrackNavigation: { captureParams: ['productId', 'category'] },
  navigationRef,
});
```

  Only the listed keys' primitive values are captured (strings capped, nested objects/arrays dropped). Never list keys that can hold personal data.

See [`examples/AutoNavTracking.tsx`](./examples/AutoNavTracking.tsx) for a complete setup.

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

Get the unique install ID assigned by the LinkForty server when the install is reported (on first launch, or on a later launch if that report failed). `null` until then.

```typescript
const installId = await LinkForty.getInstallId();
```

**Returns:** `string | null`

---

### `clearData()`

Clear all cached SDK data (install ID, install link data, the install-reported flag, the attribution context and the saved link hosts, which are then fetched again). The next app launch will behave as a fresh install. Deep link listening keeps working.

```typescript
await LinkForty.clearData();
```

## Data collected

To match an install or a direct open to a link click, the SDK sends:

- **On the install report (first launch):** user agent, timezone, device language, screen width and height, platform (`ios`/`android`), OS version, and on Android the Google Play install referrer. The server also sees the request's IP address.
- **On a direct deep link open:** the link's path, with timezone, language, screen size, platform and OS version.
- **On each event:** the server-assigned install ID, the event name and the properties you pass, a timestamp, a session ID, and the link currently credited for the visit.
- **On every request:** the SDK's name and version, `appToken` if set, and `apiKey` if set.

The SDK does not read the IDFA or GAID, does not show an App Tracking Transparency prompt, and does not use SKAdNetwork. It stores the install ID, the install's link data, the last link that opened the app and your workspace's link hosts in AsyncStorage; `clearData()` removes all of them.

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
  // Deferred deep links only (onDeferredDeepLink / getInstallData):
  confidenceScore?: number;   // 0-100
  matchedFactors?: string[];  // e.g. ['ip', 'user_agent', 'timezone']
  attributionMethod?: 'install_referrer' | 'fingerprint' | 'none' | string;
  competingLinks?: number;
}
```

`confidenceScore`, `matchedFactors`, `attributionMethod` and `competingLinks` are set only on the deferred deep link; direct opens leave them undefined, and servers that do not report `attributionMethod` or `competingLinks` leave those undefined too.

`competingLinks` is how many other links had a click from the install's network that also reached the confidence threshold. `0` means no other link was in contention; above `0` means another device's tap may be what led to this install, so an app acting on a sensitive link (sign-in, gift) can treat the match as unverified, for example by asking the user to confirm.

### `LinkFortyConfig`

```typescript
interface LinkFortyConfig {
  baseUrl: string;
  apiKey?: string;
  appToken?: string;
  debug?: boolean;
  attributionWindow?: number;
  requestTimeoutMs?: number; // default 10000
  // true = screen names only; pass options to opt into specific params
  autoTrackNavigation?: boolean | { captureParams?: string[]; debounceMs?: number };
  navigationRef?: NavigationContainerRefLike; // required when autoTrackNavigation is enabled
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
  externalUserId?: string;
}
```

### `CreateLinkResult`

```typescript
interface CreateLinkResult {
  url: string;
  shortCode: string;
  linkId: string;
  deduplicated?: boolean;
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
4. The server matches the fingerprint to the original click (probabilistic attribution). On Android, the SDK also sends the Google Play install referrer, read through `react-native-device-info` (waiting at most 2 seconds): a LinkForty link puts its click id in the referrer of the Play listing it sends the visitor to, so a server on `@linkforty/core` 1.41.1 or later matches the install to that exact click instead (`attributionMethod: 'install_referrer'`, `competingLinks: 0`)
5. Your `onDeferredDeepLink` callback fires with the matched link data
6. Your app navigates to the content the user originally clicked on

## Troubleshooting

### Deep links not working on iOS

1. Verify AASA file is accessible at `https://yourdomain.com/.well-known/apple-app-site-association`
2. Check that Team ID and Bundle ID are correct in the AASA file
3. Confirm "Associated Domains" capability is added in Xcode with `applinks:yourdomain.com`
4. If the app opens from the link but `onDeepLink` never fires, the `AppDelegate` (or `SceneDelegate`) methods that forward links to `RCTLinkingManager` are missing (see [iOS Setup](#ios-setup), step 3)
5. Test on a real device (Universal Links don't work in the simulator)

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

1. Confirm this is a first install (or call `clearData()` first). The install is reported on the first launch; a report that fails (for example with no connection) is retried on each later launch until it succeeds
2. Enable `debug: true` and check logs for fingerprint data
3. Verify your LinkForty server received the install event
4. Ensure the click and install happen within the attribution window (default: 7 days)
5. Test on the same network for best fingerprint match accuracy

### TypeScript errors

React Native ships its own type definitions, so `@types/react-native` is not needed (it is a deprecated stub). Make sure `@types/react` is installed:

```bash
npm install --save-dev @types/react
```

### `AsyncStorage is null` or a missing native module at runtime

The native modules aren't linked into the app. Install them in your app (see [Native dependencies](#native-dependencies)), run `cd ios && pod install`, and rebuild the app (a JavaScript reload is not enough).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Other SDKs

| Platform | Package |
|----------|---------|
| Expo | [`@linkforty/mobile-sdk-expo`](https://github.com/LinkForty/mobile-sdk-expo) |
| iOS (Swift) | [LinkFortySDK](https://github.com/LinkForty/mobile-sdk-ios) |
| Android (Kotlin) | [LinkFortySDK](https://github.com/LinkForty/mobile-sdk-android) |
| Flutter | [`linkforty_flutter`](https://github.com/LinkForty/mobile-sdk-flutter) |

## Support

- **Documentation:** [docs.linkforty.com](https://docs.linkforty.com)
- **Issues:** [GitHub Issues](https://github.com/LinkForty/mobile-sdk-react-native/issues)
- **Core Engine:** [LinkForty Core](https://github.com/LinkForty/core) — self-hosted open-source backend
- **Hosted service:** [linkforty.com](https://linkforty.com) — dashboard, teams, and billing
