import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The hosts the app's workspace serves links on, which decide whether a URL is
 * looked up as a LinkForty link.
 *
 * Learned from `GET /api/sdk/v1/link-domains` with the app token, and saved, so
 * a later launch knows them before the refresh finishes. Unknown without an
 * app token, or on a server without the endpoint; then only URLs on the base
 * URL's host are looked up.
 *
 * Kept free of React Native imports so it can be tested (see urlParameters.ts).
 */

const STORAGE_KEY = '@linkforty:link_domains';

/** How long a link waits for the first fetch when no list was saved earlier. */
const FIRST_FETCH_WAIT_MS = 3000;

/** Fetches a path on the LinkForty server; rejects with `status` set on an HTTP error. */
export type LinkDomainsRequest = (path: string) => Promise<{ domains: string[] }>;

/**
 * The lowercased host of an `http(s)` URL, without port or credentials; null
 * for any other scheme. Hermes-safe (no URL API).
 */
export function hostOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]*)/i.exec(url.trim());
  if (!match) return null;
  const authority = match[1].substring(match[1].lastIndexOf('@') + 1);
  const host = authority.startsWith('[')
    ? authority.substring(0, authority.indexOf(']') + 1)
    : authority.split(':')[0];
  return host ? host.toLowerCase() : null;
}

export class LinkDomains {
  private readonly baseHost: string | null;
  private hosts: Set<string> | null = null;
  private ready: Promise<void> = Promise.resolve();

  constructor(
    baseUrl: string,
    private readonly request: LinkDomainsRequest,
    private readonly appToken?: string,
    private readonly debug = false,
  ) {
    this.baseHost = hostOf(baseUrl);
  }

  /**
   * Loads the saved hosts and, with an app token, refreshes them in the
   * background. Links handled before the first fetch wait for it, at most
   * 3 seconds, when no list was saved on an earlier launch.
   */
  start(): void {
    this.ready = (async () => {
      await this.load();
      if (!this.appToken) return;
      const refresh = this.refresh();
      if (this.hosts === null) {
        await Promise.race([refresh, new Promise((r) => setTimeout(r, FIRST_FETCH_WAIT_MS))]);
      }
    })();
  }

  /**
   * Whether `url` is looked up as a LinkForty link: an `http(s)` URL on the
   * base URL's host or a workspace link host. Other schemes never are.
   */
  async shouldLookUp(url: string): Promise<boolean> {
    await this.ready;
    const host = hostOf(url);
    if (!host) return false;
    if (host === this.baseHost) return true;
    return this.hosts?.has(host) ?? false;
  }

  /**
   * Fetches the hosts. A 2xx replaces the saved list; a 4xx (no such app
   * token, or a server without the endpoint) forgets it; a network or server
   * error keeps what is known.
   */
  async refresh(): Promise<void> {
    try {
      const response = await this.request('/api/sdk/v1/link-domains');
      await this.update(new Set(response.domains.map((d) => d.toLowerCase())));
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status !== undefined && status >= 400 && status < 500) {
        this.log(`Link domains unavailable (${status}); looking up links on the base URL only`);
        await this.update(null);
      } else {
        this.log('Link domains refresh failed, keeping what is known:', error);
      }
    }
  }

  private async load(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) this.hosts = new Set(JSON.parse(saved) as string[]);
    } catch (error) {
      this.log('Failed to read saved link domains:', error);
    }
  }

  private async update(hosts: Set<string> | null): Promise<void> {
    this.hosts = hosts;
    try {
      if (hosts) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...hosts].sort()));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      this.log('Failed to save link domains:', error);
    }
  }

  private log(...args: unknown[]): void {
    if (this.debug) console.log('[LinkForty]', ...args);
  }
}
