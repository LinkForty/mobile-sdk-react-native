# LinkForty React Native SDK Examples

This directory contains practical examples demonstrating how to integrate and use the LinkForty React Native SDK in real-world applications.

## Examples

### 1. BasicSetup.tsx
**Level:** Beginner
**Use Case:** Getting started with LinkForty

Shows the minimal setup required to integrate LinkForty into a React Native app:
- SDK initialization
- Handling deferred deep links (new installs)
- Handling direct deep links (existing users)
- Basic navigation based on deep link data

**Key Concepts:**
- SDK configuration
- Deep link callbacks
- UTM parameter routing

---

### 2. EcommerceTracking.tsx
**Level:** Intermediate
**Use Case:** E-commerce and conversion tracking

Demonstrates tracking e-commerce events for attribution and analytics:
- Product view tracking
- Add to cart events
- Purchase conversion tracking
- Revenue and order tracking

**Key Concepts:**
- Event tracking API
- Conversion events
- Webhook triggers
- Revenue attribution

**Triggers Webhooks:** ✅ Yes (on purchase events)

---

### 3. SelfHostedSetup.tsx
**Level:** Intermediate
**Use Case:** Using self-hosted LinkForty Core

Shows how to configure the SDK for self-hosted LinkForty Core instances:
- Local development setup
- Production self-hosted setup
- Custom attribution windows
- Docker Compose configuration

**Key Concepts:**
- Self-hosting configuration
- Custom base URLs
- Development vs. production setups
- Docker deployment

---

### 4. AdvancedHooks.tsx
**Level:** Advanced
**Use Case:** TypeScript and custom React hooks

Advanced patterns using custom React hooks and TypeScript:
- `useLinkForty` - SDK initialization hook
- `useInstallAttribution` - Attribution data hook
- `useDeepLink` - Deep link handling hook
- `useEventTracking` - Event tracking with state management
- TypeScript utility functions
- Error handling patterns

**Key Concepts:**
- Custom React hooks
- TypeScript patterns
- State management
- Error handling
- Utility functions

---

## Quick Start

### Running the Examples

1. **Create a new React Native project:**
   ```bash
   npx react-native init LinkFortyExample
   cd LinkFortyExample
   ```

2. **Install the SDK:**
   ```bash
   npm install @linkforty/react-native-sdk
   npm install @react-native-async-storage/async-storage react-native-device-info
   ```

3. **Copy an example:**
   ```bash
   # Copy the example you want to try
   cp node_modules/@linkforty/react-native-sdk/examples/BasicSetup.tsx ./App.tsx
   ```

4. **Update configuration:**
   ```typescript
   // Replace with your LinkForty instance URL
   await LinkForty.init({
     baseUrl: 'https://go.yourdomain.com',
     debug: true,
   });
   ```

5. **Configure deep linking:**

   **iOS (ios/YourApp/Info.plist):**
   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLSchemes</key>
       <array>
         <string>yourapp</string>
       </array>
     </dict>
   </array>
   ```

   **Android (android/app/src/main/AndroidManifest.xml):**
   ```xml
   <intent-filter android:autoVerify="true">
     <action android:name="android.intent.action.VIEW" />
     <category android:name="android.intent.category.DEFAULT" />
     <category android:name="android.intent.category.BROWSABLE" />
     <data android:scheme="https" />
     <data android:host="go.yourdomain.com" />
   </intent-filter>
   ```

6. **Run the app:**
   ```bash
   # iOS
   npx react-native run-ios

   # Android
   npx react-native run-android
   ```

---

## Testing Deep Links

### iOS Testing

1. **Create a test link** in your LinkForty dashboard
2. **Uninstall the app** from your device
3. **Open Safari** and navigate to your LinkForty short link
4. **Install the app** from the App Store or Xcode
5. **Check the console** for deferred deep link data

### Android Testing

1. **Create a test link** in your LinkForty dashboard
2. **Uninstall the app** from your device
3. **Open Chrome** and navigate to your LinkForty short link
4. **Install the app** from the Play Store or Android Studio
5. **Check Logcat** for deferred deep link data

### Testing Direct Deep Links (Existing Users)

```bash
# iOS
xcrun simctl openurl booted "https://go.yourdomain.com/abc123"

# Android
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://go.yourdomain.com/abc123" com.yourapp
```

---

## Common Use Cases

### E-commerce App
Use `EcommerceTracking.tsx` to:
- Track product views for analytics
- Monitor add-to-cart conversion rates
- Attribute purchases to marketing campaigns
- Trigger conversion webhooks to your backend

### Content App
Use `BasicSetup.tsx` to:
- Route users to specific articles or videos
- Track content engagement
- Measure campaign effectiveness
- Enable social sharing with attribution

### SaaS/Subscription App
Combine `EcommerceTracking.tsx` + `AdvancedHooks.tsx` to:
- Track trial signups
- Monitor subscription conversions
- Attribute revenue to campaigns
- Calculate customer acquisition cost (CAC)

---

## 🔗 Deep Link URL Structure

### Example LinkForty Link
```
https://go.yourdomain.com/summer24
```

### Configured URLs in LinkForty Dashboard

**iOS URL:**
```
yourapp://product/123?ref=summer24
```

**Android URL:**
```
yourapp://product/123?ref=summer24
```

**UTM Parameters:**
```
utm_source=facebook
utm_medium=cpc
utm_campaign=summer-sale
utm_content=product-123
```

### Handling in Your App

```typescript
LinkForty.onDeepLink((url, deepLinkData) => {
  console.log('Full URL:', url);
  // Output: yourapp://product/123?ref=summer24

  console.log('Deep link data:', deepLinkData);
  // Output: {
  //   shortCode: 'summer24',
  //   utmParameters: {
  //     source: 'facebook',
  //     medium: 'cpc',
  //     campaign: 'summer-sale',
  //     content: 'product-123'
  //   },
  //   customParameters: {
  //     ref: 'summer24'
  //   }
  // }

  // Navigate to product screen
  navigation.navigate('Product', { id: '123' });
});
```

---

## Debugging Tips

### Enable Debug Logging

```typescript
await LinkForty.init({
  baseUrl: 'https://go.yourdomain.com',
  debug: true, // Enable verbose logging
});
```

### Check Install Data

```typescript
const installData = await LinkForty.getInstallData();
console.log('Install data:', installData);
```

### Clear Cached Data (Testing)

```typescript
await LinkForty.clearData();
// App will behave as if it's a fresh install
```

### Verify SDK Health

```bash
# Check if your LinkForty instance is reachable
curl https://go.yourdomain.com/api/sdk/v1/health
```

---

## Additional Resources

- **Full Documentation:** [https://docs.linkforty.com](https://docs.linkforty.com)
- **API Reference:** See main [README.md](../README.md#api-reference)
- **GitHub Issues:** [Report bugs or request features](https://github.com/linkforty/react-native-sdk/issues)

---

## Contributing

Have a great example to share? We'd love to include it!

1. Create your example following the existing pattern
2. Add documentation to this README
3. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

## License

All examples are licensed under the MIT License - use them freely in your projects!
