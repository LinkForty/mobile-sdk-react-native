import { describe, it, expect, vi, beforeEach } from 'vitest';

// A small stand-in for React Native's Linking event emitter
const linking = vi.hoisted(() => {
  type Listener = (event: { url: string }) => void;
  let listeners: Listener[] = [];
  return {
    addEventListener: vi.fn((_type: 'url', listener: Listener) => {
      listeners.push(listener);
      return { remove: () => { listeners = listeners.filter((l) => l !== listener); } };
    }),
    removeAllListeners: vi.fn(() => { listeners = []; }),
    getInitialURL: vi.fn(() => Promise.resolve(null as string | null)),
    emit(url: string) {
      for (const listener of [...listeners]) listener({ url });
    },
    count: () => listeners.length,
    reset() { listeners = []; },
  };
});

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  NativeModules: {},
  Linking: linking,
}));

vi.mock('react-native-device-info', () => ({ default: {} }));

import { DeepLinkHandler } from '../src/DeepLinkHandler';
import { LinkFortySDK } from '../src/LinkFortySDK';

const BASE_URL = 'https://go.example.com';
// Not a LinkForty URL, so the callback gets it straight away with null data
const OTHER_URL = 'myapp://settings';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  linking.reset();
  linking.addEventListener.mockClear();
});

describe('DeepLinkHandler listener', () => {
  it('adds one listener when initialized again, and the newest callback receives each link once', async () => {
    const handler = new DeepLinkHandler();
    const first = vi.fn();
    const second = vi.fn();
    handler.initialize(BASE_URL, first);
    handler.initialize(BASE_URL, second);
    await flush();

    expect(linking.count()).toBe(1);
    linking.emit(OTHER_URL);
    await flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(OTHER_URL, null);
  });

  it('cleanup() removes only its own listener, not the app\'s', async () => {
    const appListener = vi.fn();
    linking.addEventListener('url', appListener);

    const handler = new DeepLinkHandler();
    const callback = vi.fn();
    handler.initialize(BASE_URL, callback);
    handler.cleanup();
    linking.emit(OTHER_URL);
    await flush();

    expect(appListener).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
    expect(linking.count()).toBe(1);
  });

  it('listens again after cleanup() and a new initialize()', async () => {
    const handler = new DeepLinkHandler();
    handler.initialize(BASE_URL, vi.fn());
    handler.cleanup();
    const callback = vi.fn();
    handler.initialize(BASE_URL, callback);
    linking.emit(OTHER_URL);
    await flush();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(linking.count()).toBe(1);
  });
});

describe('LinkFortySDK.onDeepLink', () => {
  it('called twice, delivers each link once, to the newest callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sdk = new LinkFortySDK();
    // Install already reported, so init() sends nothing
    await (await import('@react-native-async-storage/async-storage')).default.setItem('@linkforty:first_launch', 'true');
    await sdk.init({ baseUrl: BASE_URL });

    const first = vi.fn();
    const second = vi.fn();
    sdk.onDeepLink(first);
    sdk.onDeepLink(second);
    linking.emit(OTHER_URL);
    await flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
