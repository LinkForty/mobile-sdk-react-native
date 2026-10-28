import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const linking = vi.hoisted(() => ({
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  removeAllListeners: vi.fn(),
  getInitialURL: vi.fn(() => Promise.resolve(null as string | null)),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  NativeModules: { SettingsManager: { settings: { AppleLocale: 'en_US' } } },
  Linking: linking,
}));

vi.mock('react-native-device-info', () => ({
  default: {
    getUserAgent: vi.fn(async () => 'Mozilla/5.0 (iPhone)'),
    getModel: vi.fn(async () => 'iPhone'),
    getSystemVersion: vi.fn(async () => '18.0'),
    getVersion: vi.fn(async () => '1.0.0'),
    getInstallReferrer: vi.fn(async () => 'unknown'),
  },
}));

import * as storage from '@react-native-async-storage/async-storage';
import { LinkFortySDK } from '../src/LinkFortySDK';

const store = (storage as unknown as { __store: Record<string, string> }).__store;

const INSTALL_ID = '11111111-2222-4333-8444-555555555555';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const organicInstall = {
  installId: INSTALL_ID,
  attributed: false,
  confidenceScore: 0,
  matchedFactors: [],
  deepLinkData: {},
};

type FetchCall = [string, RequestInit | undefined];

function calls(fetchMock: ReturnType<typeof vi.fn>, path: string): FetchCall[] {
  return (fetchMock.mock.calls as FetchCall[]).filter(([url]) => url.endsWith(path));
}

function networkDown(): Promise<Response> {
  return Promise.reject(new TypeError('Network request failed'));
}

const config = { baseUrl: 'https://go.example.com' };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  linking.addEventListener.mockClear();
  linking.removeAllListeners.mockClear();
  fetchMock = vi.fn(async () => jsonResponse(200, organicInstall));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LinkFortySDK install report', () => {
  it('reports the install on first launch and tracks events with its id', async () => {
    const sdk = new LinkFortySDK();
    await sdk.init(config);
    await sdk.trackEvent('signup');

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(1);
    const [[, init]] = calls(fetchMock, '/api/sdk/v1/event');
    expect(JSON.parse(String(init?.body)).installId).toBe(INSTALL_ID);
  });

  it('does not report the install again once it was reported', async () => {
    await new LinkFortySDK().init(config);
    const relaunch = new LinkFortySDK();
    await relaunch.init(config);

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(1);
    expect(await relaunch.getInstallId()).toBe(INSTALL_ID);
  });

  it('retries a failed install report on the next launch', async () => {
    fetchMock.mockImplementation(networkDown);
    const offline = new LinkFortySDK();
    await offline.init(config);
    expect(await offline.getInstallId()).toBeNull();

    fetchMock.mockImplementation(async () => jsonResponse(200, organicInstall));
    const relaunch = new LinkFortySDK();
    await relaunch.init(config);
    await relaunch.trackEvent('signup');

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(2);
    expect(await relaunch.getInstallId()).toBe(INSTALL_ID);
    const [[, init]] = calls(fetchMock, '/api/sdk/v1/event');
    expect(JSON.parse(String(init?.body)).installId).toBe(INSTALL_ID);
  });

  it('retries after a server error response', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(503, { message: 'unavailable' }));
    await new LinkFortySDK().init(config);

    fetchMock.mockImplementation(async () => jsonResponse(200, organicInstall));
    const relaunch = new LinkFortySDK();
    await relaunch.init(config);

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(2);
    expect(await relaunch.getInstallId()).toBe(INSTALL_ID);
  });

  it('delivers the deferred deep link on the launch whose report succeeds', async () => {
    fetchMock.mockImplementation(networkDown);
    const offline = new LinkFortySDK();
    const first = vi.fn();
    offline.onDeferredDeepLink(first);
    await offline.init(config);
    expect(first).toHaveBeenCalledWith(null);

    fetchMock.mockImplementation(async () =>
      jsonResponse(200, {
        ...organicInstall,
        attributed: true,
        confidenceScore: 90,
        matchedFactors: ['ip'],
        deepLinkData: { shortCode: 'abc', linkId: 'link-1' },
      }),
    );
    const relaunch = new LinkFortySDK();
    const second = vi.fn();
    relaunch.onDeferredDeepLink(second);
    await relaunch.init(config);

    expect(second).toHaveBeenCalledWith(expect.objectContaining({ shortCode: 'abc', linkId: 'link-1' }));
  });

  it('does not report again after a 2xx response without an install id', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { ...organicInstall, installId: undefined }));
    await new LinkFortySDK().init(config);
    await new LinkFortySDK().init(config);

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(1);
  });
});

describe('LinkFortySDK recovery of a device whose earlier report failed', () => {
  // What versions up to 1.9.0 left behind when the first-launch report failed:
  // the first-launch flag set, but no install ID
  function stuckDevice() {
    store['@linkforty:first_launch'] = 'true';
  }

  it('reports the install once, stores the install ID and tracks events', async () => {
    stuckDevice();
    const sdk = new LinkFortySDK();
    await sdk.init(config);
    await sdk.trackEvent('signup');

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(1);
    expect(store['@linkforty:install_id']).toBe(INSTALL_ID);
    const [[, init]] = calls(fetchMock, '/api/sdk/v1/event');
    expect(JSON.parse(String(init?.body)).installId).toBe(INSTALL_ID);

    await new LinkFortySDK().init(config);
    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(1);
  });

  it('keeps retrying while the recovery report fails', async () => {
    stuckDevice();
    fetchMock.mockImplementation(networkDown);
    await new LinkFortySDK().init(config);

    fetchMock.mockImplementation(async () => jsonResponse(200, organicInstall));
    const relaunch = new LinkFortySDK();
    await relaunch.init(config);

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(2);
    expect(await relaunch.getInstallId()).toBe(INSTALL_ID);
  });

  it('recovers at most once after a 2xx response without an install ID', async () => {
    stuckDevice();
    fetchMock.mockImplementation(async () => jsonResponse(200, { ...organicInstall, installId: undefined }));
    await new LinkFortySDK().init(config);
    await new LinkFortySDK().init(config);
    await new LinkFortySDK().init(config);

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(1);
  });

  it('does not call the deferred deep link callback on a recovery report', async () => {
    const attributed = {
      ...organicInstall,
      attributed: true,
      confidenceScore: 90,
      matchedFactors: ['ip'],
      deepLinkData: { shortCode: 'abc', linkId: 'link-1' },
    };

    for (const respond of [
      async () => jsonResponse(200, attributed),
      async () => jsonResponse(200, organicInstall),
      networkDown,
    ]) {
      for (const key of Object.keys(store)) delete store[key];
      stuckDevice();
      fetchMock.mockImplementation(respond);
      const sdk = new LinkFortySDK();
      const callback = vi.fn();
      sdk.onDeferredDeepLink(callback);
      await sdk.init(config);

      expect(calls(fetchMock, '/api/sdk/v1/install').length).toBeGreaterThan(0);
      expect(callback).not.toHaveBeenCalled();
      fetchMock.mockClear();
    }
  });

  it('only restores the install ID: no install data, no credited link', async () => {
    stuckDevice();
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, {
        ...organicInstall,
        attributed: true,
        confidenceScore: 90,
        matchedFactors: ['ip'],
        deepLinkData: { shortCode: 'abc', linkId: 'link-1' },
      }),
    );
    const sdk = new LinkFortySDK();
    await sdk.init(config);
    await sdk.trackEvent('signup');

    expect(await sdk.getInstallId()).toBe(INSTALL_ID);
    expect(await sdk.getInstallData()).toBeNull();
    expect(store['@linkforty:install_data']).toBeUndefined();
    expect(sdk.getActiveAttribution()).toBeNull();
    const [[, init]] = calls(fetchMock, '/api/sdk/v1/event');
    expect(JSON.parse(String(init?.body)).attributedLinkId).toBeUndefined();
  });

  it('keeps the link credited by an earlier link tap', async () => {
    stuckDevice();
    const tapped = { linkId: 'tapped-link', openedAt: '2026-10-01T00:00:00.000Z' };
    store['@linkforty:attribution'] = JSON.stringify(tapped);
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { ...organicInstall, attributed: true, deepLinkData: { shortCode: 'abc', linkId: 'link-1' } }),
    );
    const sdk = new LinkFortySDK();
    await sdk.init(config);

    expect(sdk.getActiveAttribution()).toEqual(tapped);
  });

  it('never reports again on a device that has an install ID', async () => {
    store['@linkforty:first_launch'] = 'true';
    store['@linkforty:install_id'] = INSTALL_ID;
    const sdk = new LinkFortySDK();
    await sdk.init(config);
    await new LinkFortySDK().init(config);

    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(0);
    expect(await sdk.getInstallId()).toBe(INSTALL_ID);
  });
});

function logged(): string {
  const spies = [console.log, console.warn, console.error] as unknown as ReturnType<typeof vi.fn>[];
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => args.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

describe('LinkFortySDK logging', () => {
  const API_KEY = 'lf_live_secret_key_123';
  const LINK = 'https://go.example.com/abc123?utm_source=email&email=person%40example.com';

  async function openLink(debug: boolean) {
    linking.getInitialURL.mockResolvedValueOnce(LINK);
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/api/sdk/v1/resolve/')
        ? jsonResponse(200, { shortCode: 'abc123', linkId: 'link-1', customParameters: { route: 'promo' } })
        : jsonResponse(200, organicInstall),
    );
    const sdk = new LinkFortySDK();
    await sdk.init({ ...config, apiKey: API_KEY, debug });
    return new Promise<unknown>((resolve) => sdk.onDeepLink((_url, data) => resolve(data)));
  }

  it('logs nothing on a successful launch and deep link without debug', async () => {
    const data = await openLink(false);

    expect(data).toEqual(expect.objectContaining({ linkId: 'link-1' }));
    expect(logged()).toBe('');
  });

  it('logs nothing on a cold start without a link and without debug', async () => {
    const sdk = new LinkFortySDK();
    await sdk.init(config);
    sdk.onDeepLink(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logged()).toBe('');
  });

  it('logs the link with debug, but never the API key', async () => {
    await openLink(true);

    const output = logged();
    expect(output).toContain('go.example.com/abc123');
    expect(output).toContain('[redacted]');
    expect(output).not.toContain(API_KEY);
  });

  it('surfaces a failed install report without debug', async () => {
    fetchMock.mockImplementation(networkDown);
    await new LinkFortySDK().init({ ...config, apiKey: API_KEY });

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(logged()).toContain('Failed to report install');
    expect(logged()).not.toContain(API_KEY);
  });
});

describe('LinkFortySDK.clearData', () => {
  const appConfig = { ...config, appToken: 'at_00000000000000000000000000000000' };

  it('removes the saved link hosts and reports a new install on the next launch', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/api/sdk/v1/link-domains')
        ? jsonResponse(200, { domains: ['links.example.org'] })
        : jsonResponse(200, organicInstall),
    );
    const sdk = new LinkFortySDK();
    await sdk.init(appConfig);
    await vi.waitFor(() => expect(store['@linkforty:link_domains']).toBeDefined());

    // The refresh clearData() starts finds no hosts this time
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/api/sdk/v1/link-domains')
        ? jsonResponse(404, { message: 'not found' })
        : jsonResponse(200, organicInstall),
    );
    await sdk.clearData();

    expect(store['@linkforty:link_domains']).toBeUndefined();
    expect(store['@linkforty:install_id']).toBeUndefined();
    expect(store['@linkforty:first_launch']).toBeUndefined();
    expect(await sdk.getInstallId()).toBeNull();

    await new LinkFortySDK().init(appConfig);
    expect(calls(fetchMock, '/api/sdk/v1/install')).toHaveLength(2);
  });

  it('can be called before init()', async () => {
    store['@linkforty:link_domains'] = '["links.example.org"]';
    await new LinkFortySDK().clearData();
    expect(store['@linkforty:link_domains']).toBeUndefined();
  });
});
