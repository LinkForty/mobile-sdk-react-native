# Contributing to LinkForty React Native SDK

Thank you for your interest in contributing to the LinkForty React Native SDK! We welcome contributions from the community and are grateful for your support.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. Please be respectful and constructive in your interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes
4. **Make your changes**
5. **Test your changes** thoroughly
6. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 20+ and npm 10+
- React Native development environment (iOS and/or Android)
- React Native 0.76+
- TypeScript 5.9+
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/linkforty/react-native-sdk.git
cd react-native-sdk

# Install dependencies
npm install

# Build the TypeScript code
npm run build
```

### Project Structure

```
linkforty-react-native-sdk/
├── src/
│   ├── index.ts              # Main export file
│   ├── LinkFortySDK.ts       # Core SDK class
│   ├── DeepLinkHandler.ts    # Deep link handling
│   ├── FingerprintCollector.ts # Device fingerprinting
│   └── types.ts              # TypeScript type definitions
├── dist/                     # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── LICENSE
```

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run build -- --watch
```

## How to Contribute

### Types of Contributions

We welcome many types of contributions:

- **Bug fixes**
- **New features**
- **Documentation improvements**
- **Code quality improvements**
- **Test coverage additions**
- **Platform compatibility fixes**
- **Examples and tutorials**

### Before You Start

1. **Check existing issues** to see if someone is already working on it
2. **Open an issue** to discuss major changes before implementing
3. **Keep pull requests focused** - one feature/fix per PR
4. **Follow the coding standards** outlined below

## Pull Request Process

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-new-feature
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

- Write clear, concise commit messages
- Follow the existing code style
- Add/update tests if applicable
- Update documentation as needed

### 3. Test Your Changes

```bash
# Build the SDK
npm run build

# Test in a sample React Native app
cd ../sample-app
npm install ../linkforty-react-native-sdk

# Test on both iOS and Android if possible
npx react-native run-ios
npx react-native run-android
```


### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add custom attribution window support"
```

**Commit Message Format:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### 5. Push and Create PR

```bash
git push origin feature/my-new-feature
```

Then open a Pull Request on GitHub with:
- Clear title describing the change
- Description of what changed and why
- Link to any related issues
- Screenshots/videos if UI-related
- Testing instructions

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Provide type definitions for all public APIs
- Avoid `any` types when possible
- Use interfaces for public types
- Export all public types from `types.ts`

### Code Style

```typescript
// ✅ Good
export async function trackEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void> {
  if (!this.config) {
    throw new Error('SDK not initialized. Call init() first.');
  }

  // Implementation...
}

// ❌ Avoid
export async function trackEvent(name,properties) {
  if(!this.config) throw new Error('SDK not initialized. Call init() first.');
  // Implementation...
}
```

### Best Practices

- **Error Handling**: Always handle errors gracefully
- **Logging**: Use debug mode for verbose logging
- **Privacy**: Never log sensitive user data
- **Performance**: Minimize network requests and storage operations
- **Compatibility**: Support React Native 0.60+
- **Platform-Specific**: Use Platform.select() when needed

### Documentation

```typescript
/**
 * Track an in-app event with optional properties
 *
 * @param name - Event name (e.g., 'purchase', 'signup')
 * @param properties - Optional event properties
 * @returns Promise that resolves when event is tracked
 *
 * @example
 * ```typescript
 * await LinkForty.trackEvent('purchase', {
 *   amount: 99.99,
 *   currency: 'USD',
 *   productId: 'premium_plan'
 * });
 * ```
 */
async trackEvent(
  name: string,
  properties?: Record<string, any>
): Promise<void>
```

## Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, test the following:

**iOS:**
- [ ] Universal Links work correctly
- [ ] Deferred deep links attribute on first install
- [ ] Direct deep links open the app
- [ ] Event tracking works
- [ ] No crashes or errors in debug mode

**Android:**
- [ ] App Links work correctly
- [ ] Deferred deep links attribute on first install
- [ ] Direct deep links open the app
- [ ] Event tracking works
- [ ] No crashes or errors in debug mode

**Both Platforms:**
- [ ] TypeScript types are correct
- [ ] Documentation is accurate
- [ ] No breaking API changes (or documented)
- [ ] Performance is acceptable
- [ ] Privacy requirements met

### Test Scenarios

1. **Fresh Install Attribution**
   - Click a link in mobile browser
   - Install app from store
   - Verify `onDeferredDeepLink` receives attribution data

2. **Direct Deep Link**
   - App is already installed
   - Click a link in mobile browser
   - Verify `onDeepLink` is called with correct data

3. **Event Tracking**
   - Track various events
   - Verify events appear in backend
   - Verify webhooks are triggered (if configured)

4. **Edge Cases**
   - No internet connection
   - Invalid deep link URLs
   - Backend server errors
   - Concurrent SDK calls

## Reporting Bugs

### Before Reporting

1. **Check existing issues** to avoid duplicates
2. **Update to latest version** to see if it's already fixed
3. **Test in a fresh React Native project** to isolate the issue

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Initialize SDK with '...'
2. Call method '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment:**
- OS: [e.g., iOS 17.0, Android 14]
- React Native version: [e.g., 0.72.0]
- SDK version: [e.g., 1.0.0]
- Device: [e.g., iPhone 14 Pro, Pixel 7]

**Logs**
```typescript
// Relevant error logs or stack traces
```

**Additional context**
Any other context about the problem.

## Feature Requests

We love feature requests! Please include:

1. **Use case** - Why do you need this feature?
2. **Proposed solution** - How do you think it should work?
3. **Alternatives** - What alternatives have you considered?
4. **Platform** - Is this iOS-specific, Android-specific, or both?

## Questions?

- **GitHub Issues**: For bugs and feature requests

## License

By contributing to LinkForty React Native SDK, you agree that your contributions will be licensed under the MIT License.


Thank you for making LinkForty better! 🎉
