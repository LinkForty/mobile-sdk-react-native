# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.2] - 2026-02-12
### Added
- `createLink()` method for creating short links programmatically from mobile apps via the LinkForty API
- `CreateLinkOptions` type — accepts optional `templateId`, `templateSlug`, `deepLinkParameters`, `title`, `description`, `customCode`, and `utmParameters`

## [1.1.1] - 2026-02-12
### Added
- `CreateLinkResult` type — returns `url` (full shareable URL), `shortCode`, and `linkId`
- Exported `CreateLinkOptions` and `CreateLinkResult` types from package entry point
- Simplified link creation: when `templateId` is omitted, the SDK calls `POST /api/sdk/v1/links` which auto-selects the organization's default template — mobile apps no longer need to know template IDs or slugs

## [1.1.0] - 2026-02-11

### Added
- Server-side URL resolution for deep links intercepted by App Links (Android) and Universal Links (iOS) — when the OS opens the app directly, the SDK now calls the resolve endpoint to retrieve custom parameters, UTM data, and link metadata
- Device fingerprint collection sent with resolve requests for click attribution and deferred deep linking analytics
- `deepLinkPath` and `appScheme` optional fields on `DeepLinkData` type
- `ResolveFunction` type export for advanced SDK consumers

### Changed
- `DeepLinkHandler.handleDeepLink` is now async to support server-side URL resolution
- `DeepLinkHandler.initialize` accepts an optional `resolveFn` parameter for URL resolution
- `DeepLinkHandler.parseURL` now correctly extracts the short code from template URLs (e.g., `/templateSlug/shortCode`)
- `LinkFortySDK.onDeepLink` automatically provides a resolver that calls the backend resolve endpoint
- Deferred deep link responses now normalize `deepLinkParameters` from the backend into `customParameters` for a consistent interface across direct and deferred deep link paths

### Fixed
- Fixed deep links returning empty `customParameters` when the app was opened via App Links or Universal Links, where the OS intercepted the URL before the LinkForty server could append parameters via redirect

## [1.0.1] - 2025-12-11

- Initial release
