import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('react-native-device-info', () => ({ default: { getInstallReferrer: vi.fn() } }));

import { readPlayInstallReferrer } from '../src/InstallReferrer';

const REFERRER = 'lf_click=11111111-2222-4333-8444-555555555555&utm_source=poster';
const fast = { os: 'android', pollIntervalMs: 1 };

describe('readPlayInstallReferrer', () => {
  it('reads nothing on iOS', async () => {
    const get = vi.fn(async () => REFERRER);
    expect(await readPlayInstallReferrer({ os: 'ios', getInstallReferrer: get })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the referrer Play recorded', async () => {
    expect(await readPlayInstallReferrer({ ...fast, getInstallReferrer: async () => REFERRER })).toBe(REFERRER);
  });

  it('waits while the answer is not stored yet', async () => {
    const get = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('unknown')
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce(REFERRER);
    expect(await readPlayInstallReferrer({ ...fast, getInstallReferrer: get })).toBe(REFERRER);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('returns null for an empty referrer', async () => {
    expect(await readPlayInstallReferrer({ ...fast, getInstallReferrer: async () => '' })).toBeNull();
  });

  it('gives up at the timeout', async () => {
    const started = Date.now();
    const result = await readPlayInstallReferrer({ ...fast, timeoutMs: 50, getInstallReferrer: async () => 'unknown' });
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});
