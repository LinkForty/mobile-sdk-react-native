import { describe, it, expect, vi } from 'vitest';
import { DeferredDeepLink } from '../src/DeferredDeepLink';
import type { DeepLinkData } from '../src/types';

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
