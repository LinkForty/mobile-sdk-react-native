import { describe, it, expect, vi } from 'vitest';
import { DeferredDeepLink, deferredDeepLinkFromInstall } from '../src/DeferredDeepLink';
import type { DeepLinkData, InstallAttributionResponse } from '../src/types';

const data = { shortCode: 'abc123', linkId: 'link-1' } as DeepLinkData;

describe('DeferredDeepLink', () => {
  it('calls a callback registered before the install is reported', () => {
    const deferred = new DeferredDeepLink();
    const callback = vi.fn();
    deferred.register(callback);
    deferred.deliver(data);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(data);
  });

  it('calls a callback registered after the install is reported', () => {
    const deferred = new DeferredDeepLink();
    deferred.deliver(data);
    const callback = vi.fn();
    deferred.register(callback);

    expect(callback).toHaveBeenCalledWith(data);
  });

  it('delivers null for an organic install registered after init', () => {
    const deferred = new DeferredDeepLink();
    deferred.deliver(null);
    const callback = vi.fn();
    deferred.register(callback);

    expect(callback).toHaveBeenCalledWith(null);
  });

  it('calls nothing on a launch that does not report the install', () => {
    const deferred = new DeferredDeepLink();
    const callback = vi.fn();
    deferred.register(callback);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('deferredDeepLinkFromInstall', () => {
  const matched: InstallAttributionResponse = {
    installId: 'install-1',
    attributed: true,
    confidenceScore: 85,
    matchedFactors: ['ip', 'user_agent', 'timezone'],
    attributionMethod: 'fingerprint',
    competingLinks: 2,
    deepLinkData: {
      shortCode: 'abc123',
      linkId: 'link-1',
      confidenceScore: 85,
      matchedFactors: ['ip', 'user_agent', 'timezone'],
      attributionMethod: 'fingerprint',
      competingLinks: 2,
    },
  };

  it('passes the match certainty fields through to the deferred deep link', () => {
    const link = deferredDeepLinkFromInstall(matched);

    expect(link).toMatchObject({
      shortCode: 'abc123',
      linkId: 'link-1',
      confidenceScore: 85,
      matchedFactors: ['ip', 'user_agent', 'timezone'],
      attributionMethod: 'fingerprint',
      competingLinks: 2,
    });
  });

  it('delivers the match certainty fields to the onDeferredDeepLink callback', () => {
    const deferred = new DeferredDeepLink();
    const callback = vi.fn();
    deferred.register(callback);
    deferred.deliver(deferredDeepLinkFromInstall(matched));

    const delivered = callback.mock.calls[0][0] as DeepLinkData;
    expect(delivered.confidenceScore).toBe(85);
    expect(delivered.matchedFactors).toEqual(['ip', 'user_agent', 'timezone']);
    expect(delivered.attributionMethod).toBe('fingerprint');
    expect(delivered.competingLinks).toBe(2);
  });

  it('keeps the fields through the JSON round trip used by getInstallData', () => {
    const stored = JSON.parse(JSON.stringify(deferredDeepLinkFromInstall(matched)));

    expect(stored.attributionMethod).toBe('fingerprint');
    expect(stored.competingLinks).toBe(2);
    expect(stored.confidenceScore).toBe(85);
    expect(stored.matchedFactors).toEqual(['ip', 'user_agent', 'timezone']);
  });

  it('keeps competingLinks of 0', () => {
    const link = deferredDeepLinkFromInstall({
      ...matched,
      competingLinks: 0,
      deepLinkData: { shortCode: 'abc123', attributionMethod: 'fingerprint', competingLinks: 0 },
    });

    expect(link?.competingLinks).toBe(0);
  });

  it('leaves attributionMethod and competingLinks undefined when the server omits them', () => {
    const link = deferredDeepLinkFromInstall({
      installId: 'install-1',
      attributed: true,
      confidenceScore: 85,
      matchedFactors: ['ip'],
      deepLinkData: { shortCode: 'abc123', confidenceScore: 85, matchedFactors: ['ip'] },
    });

    expect(link?.attributionMethod).toBeUndefined();
    expect(link?.competingLinks).toBeUndefined();
    expect(link?.confidenceScore).toBe(85);
    expect(link?.matchedFactors).toEqual(['ip']);
  });

  it('leaves all four fields undefined when the server sends none of them', () => {
    const response = {
      installId: 'install-1',
      attributed: true,
      deepLinkData: { shortCode: 'abc123' },
    } as unknown as InstallAttributionResponse;
    const link = deferredDeepLinkFromInstall(response);

    expect(link?.shortCode).toBe('abc123');
    expect(link?.confidenceScore).toBeUndefined();
    expect(link?.matchedFactors).toBeUndefined();
    expect(link?.attributionMethod).toBeUndefined();
    expect(link?.competingLinks).toBeUndefined();
  });

  it('falls back to the top-level fields when the deep link data lacks them', () => {
    const link = deferredDeepLinkFromInstall({
      ...matched,
      deepLinkData: { shortCode: 'abc123' },
    });

    expect(link).toMatchObject({
      confidenceScore: 85,
      matchedFactors: ['ip', 'user_agent', 'timezone'],
      attributionMethod: 'fingerprint',
      competingLinks: 2,
    });
  });

  it('maps deepLinkParameters to customParameters', () => {
    const link = deferredDeepLinkFromInstall({
      ...matched,
      deepLinkData: {
        shortCode: 'abc123',
        deepLinkParameters: { route: 'PRODUCT', id: '42' },
      } as unknown as DeepLinkData,
    });

    expect(link?.customParameters).toEqual({ route: 'PRODUCT', id: '42' });
  });

  it('returns null for an organic install', () => {
    const organic: InstallAttributionResponse = {
      installId: 'install-2',
      attributed: false,
      confidenceScore: 0,
      matchedFactors: [],
      attributionMethod: 'none',
      competingLinks: 0,
      deepLinkData: {},
    };

    expect(deferredDeepLinkFromInstall(organic)).toBeNull();
  });
});
