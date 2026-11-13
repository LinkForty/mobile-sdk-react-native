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
import { FingerprintCollector } from '../src/FingerprintCollector';

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

describe('DeepLinkHandler resolve request', () => {
  const FINGERPRINT = {
    timezone: 'Europe/Paris',
    language: 'fr-FR',
    screenResolution: '390x844',
    platform: 'ios',
    osVersion: '18.1',
  } as Awaited<ReturnType<typeof FingerprintCollector.collect>>;

  async function resolvePathFor(url: string, fingerprint: 'ok' | 'fails' = 'ok'): Promise<string> {
    const spy = vi.spyOn(FingerprintCollector, 'collect');
    if (fingerprint === 'ok') spy.mockResolvedValue(FINGERPRINT);
    else spy.mockRejectedValue(new Error('no device info'));

    const resolveFn = vi.fn().mockResolvedValue({ shortCode: 'abc', linkId: 'link-1' });
    const handler = new DeepLinkHandler();
    handler.initialize(BASE_URL, vi.fn(), resolveFn);
    linking.emit(url);
    await vi.waitFor(() => expect(resolveFn).toHaveBeenCalledTimes(1));
    handler.cleanup();
    spy.mockRestore();
    return resolveFn.mock.calls[0][0] as string;
  }

  function queryOf(path: string): Record<string, string> {
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    return Object.fromEntries(new URLSearchParams(query));
  }

  it("passes the link's query parameters along with the fingerprint", async () => {
    const path = await resolvePathFor(`${BASE_URL}/abc?os_id=u1&utm_campaign=winback`);

    expect(path.startsWith('/api/sdk/v1/resolve/abc?')).toBe(true);
    expect(queryOf(path)).toEqual({
      os_id: 'u1',
      utm_campaign: 'winback',
      fp_tz: 'Europe/Paris',
      fp_lang: 'fr-FR',
      fp_sw: '390',
      fp_sh: '844',
      fp_platform: 'ios',
      fp_pv: '18.1',
    });
  });

  it('keeps its own fingerprint values over fp_ parameters on the link', async () => {
    const query = queryOf(await resolvePathFor(`${BASE_URL}/abc?fp_tz=evil&FP_LANG=evil&os_id=u1`));

    expect(query.fp_tz).toBe('Europe/Paris');
    expect(query.fp_lang).toBe('fr-FR');
    expect(query.FP_LANG).toBeUndefined();
    expect(query.os_id).toBe('u1');
  });

  it('encodes values once', async () => {
    const query = queryOf(await resolvePathFor(`${BASE_URL}/abc?note=${encodeURIComponent('a b&c')}`));

    expect(query.note).toBe('a b&c');
  });

  it('reads a literal "+" in the link as a space, as a server does, and keeps %2B as "+"', async () => {
    const query = queryOf(await resolvePathFor(`${BASE_URL}/abc?iterable_id=a+b%40x.com&email=c%2Bd%40x.com`));

    expect(query.iterable_id).toBe('a b@x.com');
    expect(query.email).toBe('c+d@x.com');
  });

  it("passes the link's parameters when the fingerprint can't be collected", async () => {
    const path = await resolvePathFor(`${BASE_URL}/tpl/abc?os_id=u1`, 'fails');

    expect(path).toBe('/api/sdk/v1/resolve/tpl/abc?os_id=u1');
  });

  it('sends only the fingerprint for a link with no query', async () => {
    const query = queryOf(await resolvePathFor(`${BASE_URL}/abc`));

    expect(Object.keys(query).sort()).toEqual(['fp_lang', 'fp_platform', 'fp_pv', 'fp_sh', 'fp_sw', 'fp_tz']);
  });
});
