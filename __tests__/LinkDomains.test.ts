import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinkDomains, hostOf } from '../src/LinkDomains';

const BASE = 'https://api.example.com';
const TOKEN = 'at_0123456789abcdef0123456789abcdef';
const STORAGE_KEY = '@linkforty:link_domains';

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('hostOf', () => {
  it('returns the lowercased host of an http(s) URL', () => {
    expect(hostOf('https://Acme.toapp.me/abc?x=1')).toBe('acme.toapp.me');
    expect(hostOf('http://localhost:3000/abc')).toBe('localhost');
    expect(hostOf('https://user:pw@links.acme.com#frag')).toBe('links.acme.com');
    expect(hostOf('https://go.example.com')).toBe('go.example.com');
  });

  it('returns null for other schemes', () => {
    expect(hostOf('myapp://product/1')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
  });
});

describe('LinkDomains', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks up links on the workspace link hosts', async () => {
    const request = vi.fn().mockResolvedValue({ domains: ['acme.toapp.me', 'Links.Acme.com'] });
    const domains = new LinkDomains(BASE, request, TOKEN);
    domains.start();

    expect(await domains.shouldLookUp('https://acme.toapp.me/abc')).toBe(true);
    expect(await domains.shouldLookUp('https://links.acme.com/tmpl/abc?x=1')).toBe(true);
    expect(await domains.shouldLookUp('https://api.example.com/abc')).toBe(true);
    expect(await domains.shouldLookUp('https://other.com/abc')).toBe(false);
    expect(await domains.shouldLookUp('myapp://product/1')).toBe(false);
    expect(request).toHaveBeenCalledWith('/api/sdk/v1/link-domains');
  });

  it('saves the hosts for the next launch', async () => {
    const domains = new LinkDomains(BASE, vi.fn().mockResolvedValue({ domains: ['acme.toapp.me'] }), TOKEN);
    domains.start();
    await domains.shouldLookUp('https://acme.toapp.me/abc');

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('["acme.toapp.me"]');
  });

  it('uses the saved hosts while the refresh fails', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '["acme.toapp.me"]');
    const domains = new LinkDomains(BASE, vi.fn().mockRejectedValue(httpError(503)), TOKEN);
    domains.start();

    expect(await domains.shouldLookUp('https://acme.toapp.me/abc')).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('["acme.toapp.me"]');
  });

  it('forgets the hosts on a 4xx and looks up the base URL host only', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '["acme.toapp.me"]');
    const domains = new LinkDomains(BASE, vi.fn().mockRejectedValue(httpError(404)), TOKEN);
    domains.start();
    await domains.refresh();

    expect(await domains.shouldLookUp('https://acme.toapp.me/abc')).toBe(false);
    expect(await domains.shouldLookUp('https://api.example.com/abc')).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not fetch without an app token', async () => {
    const request = vi.fn().mockResolvedValue({ domains: ['acme.toapp.me'] });
    const domains = new LinkDomains(BASE, request);
    domains.start();

    expect(await domains.shouldLookUp('https://acme.toapp.me/abc')).toBe(false);
    expect(await domains.shouldLookUp('https://api.example.com/abc')).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('waits at most 3 seconds for the first fetch', async () => {
    vi.useFakeTimers();
    const domains = new LinkDomains(BASE, vi.fn(() => new Promise<never>(() => {})), TOKEN);
    domains.start();

    let answer: boolean | undefined;
    void domains.shouldLookUp('https://acme.toapp.me/abc').then((a) => { answer = a; });
    await vi.advanceTimersByTimeAsync(2900);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    expect(answer).toBe(false);
  });
});
