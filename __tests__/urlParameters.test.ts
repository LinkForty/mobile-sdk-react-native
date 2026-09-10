import { describe, expect, it } from 'vitest';
import { extractCustomParameters, mergeUrlParameters } from '../src/urlParameters';
import type { DeepLinkData } from '../src/types';

const resolved = (over: Partial<DeepLinkData> = {}): DeepLinkData =>
  ({ shortCode: 'abc123', ...over }) as DeepLinkData;

describe('extractCustomParameters', () => {
  it('keeps ordinary parameters', () => {
    expect(extractCustomParameters(new URLSearchParams('slug=titanic&promo=new-year').entries()))
      .toEqual({ slug: 'titanic', promo: 'new-year' });
  });

  it('drops the names LinkForty reserves', () => {
    // utm_* is surfaced as utmParameters, fp_* is a fingerprint signal, and
    // lf_click is the id appended to a destination URL. None is the app's.
    expect(
      extractCustomParameters(
        new URLSearchParams('slug=titanic&utm_source=ig&fp_tz=UTC&lf_click=abc').entries(),
      ),
    ).toEqual({ slug: 'titanic' });
  });

  it('matches reserved names case-insensitively', () => {
    expect(
      extractCustomParameters(new URLSearchParams('UTM_Source=ig&FP_TZ=UTC&LF_Click=x').entries()),
    ).toEqual({});
  });

  it('returns {} when there is nothing to keep', () => {
    expect(extractCustomParameters(new URLSearchParams('').entries())).toEqual({});
  });
});

describe('mergeUrlParameters', () => {
  it('adds URL parameters when the link has none configured', () => {
    const out = mergeUrlParameters(resolved(), { slug: 'titanic' });
    expect(out.customParameters).toEqual({ slug: 'titanic' });
  });

  it('lets a URL parameter override a configured one of the same name', () => {
    // Same precedence the server applies on the deferred path: what the sharer
    // put on the URL is more specific than the link's stored setup.
    const out = mergeUrlParameters(
      resolved({ customParameters: { slug: 'default', keep: 'me' } }),
      { slug: 'titanic' },
    );
    expect(out.customParameters).toEqual({ slug: 'titanic', keep: 'me' });
  });

  it('returns the payload untouched when the URL carried nothing', () => {
    const input = resolved({ customParameters: { a: '1' } });
    expect(mergeUrlParameters(input, undefined)).toBe(input);
    expect(mergeUrlParameters(input, {})).toBe(input);
  });

  it('never overwrites fields only the server knows', () => {
    const input = resolved({
      linkId: 'link-1',
      deepLinkPath: '/product/1',
      appScheme: 'myapp',
      utmParameters: { source: 'ig' },
    });
    const out = mergeUrlParameters(input, { slug: 'titanic' });
    expect(out.linkId).toBe('link-1');
    expect(out.deepLinkPath).toBe('/product/1');
    expect(out.appScheme).toBe('myapp');
    expect(out.utmParameters).toEqual({ source: 'ig' });
  });
});
