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

  it('delivers the launch URL once, however often it is initialized', async () => {
    const LAUNCH_URL = 'myapp://from-launch';
    linking.getInitialURL.mockClear();
    linking.getInitialURL.mockResolvedValue(LAUNCH_URL);
    try {
      const handler = new DeepLinkHandler();
      const first = vi.fn();
      const second = vi.fn();
      handler.initialize(BASE_URL, first);
      await flush();
      handler.initialize(BASE_URL, second);
      await flush();

      expect(linking.getInitialURL).toHaveBeenCalledTimes(1);
      expect(first).toHaveBeenCalledWith(LAUNCH_URL, null);
      expect(second).not.toHaveBeenCalled();
    } finally {
      linking.getInitialURL.mockResolvedValue(null);
      linking.getInitialURL.mockClear();
    }
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

  it('registered right after init() without awaiting it, keeps one listener and learns the link hosts', async () => {
    const LINK_HOST_URL = 'https://acme.toapp.me/abc123';
    const resolved = { shortCode: 'abc123', linkId: 'link-1', customParameters: { route: 'promo' } };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/sdk/v1/link-domains')) {
        return { ok: true, status: 200, json: async () => ({ domains: ['acme.toapp.me'] }) };
      }
      if (url.includes('/api/sdk/v1/resolve/')) {
        return { ok: true, status: 200, json: async () => resolved };
      }
      return { ok: true, status: 200, json: async () => ({ installId: 'i-1', attributed: false }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const sdk = new LinkFortySDK();
    const callback = vi.fn();
    const init = sdk.init({ baseUrl: BASE_URL, appToken: 'at_00000000000000000000000000000000' });
    sdk.onDeepLink(callback);
    await init;
    await flush();

    expect(linking.count()).toBe(1);

    linking.emit(LINK_HOST_URL);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    expect(callback).toHaveBeenCalledWith(LINK_HOST_URL, expect.objectContaining(resolved));

    // Registering again after init() still replaces the callback, with one listener
    const replacement = vi.fn();
    sdk.onDeepLink(replacement);
    await flush();
    expect(linking.count()).toBe(1);
    linking.emit(OTHER_URL);
    await flush();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a second init() while the first runs keeps one listener and one delivery per link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ installId: 'i-1', attributed: false }) })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // What React 18 StrictMode does to an effect in development: run it twice
    const sdk = new LinkFortySDK();
    const first = vi.fn();
    const second = vi.fn();
    const init1 = sdk.init({ baseUrl: BASE_URL });
    sdk.onDeepLink(first);
    const init2 = sdk.init({ baseUrl: BASE_URL });
    sdk.onDeepLink(second);
    expect(init2).toBe(init1);
    await init2;
    await flush();

    expect(linking.count()).toBe(1);
    expect(console.warn).toHaveBeenCalledWith('LinkForty SDK already initialized');

    linking.emit(OTHER_URL);
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
