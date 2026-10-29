import { describe, it, expect, vi, afterEach } from 'vitest';

const deviceInfo = vi.hoisted(() => ({
  getUserAgent: vi.fn(async () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'),
  getModel: vi.fn(async () => 'iPhone'),
  getSystemVersion: vi.fn(async () => '18.0'),
  getVersion: vi.fn(async () => '2.3.1'),
  getApplicationName: vi.fn(() => 'Acme'),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  NativeModules: {},
}));

vi.mock('react-native-device-info', () => ({ default: deviceInfo }));

import { FingerprintCollector, USER_AGENT_TIMEOUT_MS } from '../src/FingerprintCollector';

afterEach(() => {
  vi.useRealTimers();
  deviceInfo.getUserAgent.mockReset();
  deviceInfo.getUserAgent.mockImplementation(
    async () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
  );
});

describe('FingerprintCollector user agent', () => {
  it("uses the device's web user agent when the lookup answers", async () => {
    const fingerprint = await FingerprintCollector.collect();

    expect(fingerprint.userAgent).toContain('AppleWebKit');
    expect(fingerprint).toMatchObject({ osVersion: '18.0', appVersion: '2.3.1', deviceModel: 'iPhone' });
  });

  it('generates one in the native SDK form when the lookup never settles', async () => {
    vi.useFakeTimers();
    deviceInfo.getUserAgent.mockImplementation(() => new Promise<string>(() => {}));

    const pending = FingerprintCollector.collect();
    await vi.advanceTimersByTimeAsync(USER_AGENT_TIMEOUT_MS);
    const fingerprint = await pending;

    expect(fingerprint.userAgent).toBe('Acme/2.3.1 iOS/18.0');
  });

  it('generates one when the lookup rejects', async () => {
    deviceInfo.getUserAgent.mockImplementation(async () => {
      throw new Error('getUserAgentError');
    });

    const fingerprint = await FingerprintCollector.collect();

    expect(fingerprint.userAgent).toBe('Acme/2.3.1 iOS/18.0');
  });
});
