/**
 * AttributionContext — last-click attribution + session tracking for in-app events.
 *
 * LinkForty attributes in-app activity (screen views and custom events) to the
 * deep link that drove it, using a "last-click + window" model:
 *
 *   - Every deep-link open (deferred install OR direct re-engagement) pins an
 *     "active attribution context" to THAT link. The newest open wins (supersede).
 *   - Every `trackEvent` is stamped with the active context so the backend can
 *     credit the link. Whether a stamped event still counts (the window) and how
 *     screen-flow sessions are grouped is decided server-side at query time — the
 *     SDK only reports the active link + when it was opened + the current session.
 *   - A `sessionId` identifies one app-open journey. It is generated fresh on cold
 *     start and rotated on each new deep-link open, so the dashboard can group a
 *     visit's screens (session-scoped) independently of the conversion window.
 *
 * The active context is persisted (AsyncStorage) so a reopen without a new click
 * still attributes to the last link (subject to the server-side conversion window).
 * The session is intentionally in-memory: a new JS context (cold start) is a new
 * session.
 *
 * See `.brandon/sit-237-auto-nav-tracking/plan.md` §0.2 / Phase D for the model.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActiveAttribution, AttributionStamp } from './types';

const ATTRIBUTION_KEY = '@linkforty:attribution';

/**
 * Generate an RFC4122-v4-style identifier for session grouping. This is not a
 * security token — `Math.random` is sufficient and avoids a native crypto dep.
 */
function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class AttributionContext {
  private active: ActiveAttribution | null = null;
  private sessionId: string;
  private loaded = false;
  private debug: boolean;

  constructor(options: { debug?: boolean } = {}) {
    this.debug = options.debug ?? false;
    // Construction == cold start == a new session.
    this.sessionId = generateSessionId();
  }

  /**
   * Restore the persisted active attribution context. Safe to call multiple
   * times; only reads storage once. Never throws.
   */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(ATTRIBUTION_KEY);
      if (raw) {
        this.active = JSON.parse(raw) as ActiveAttribution;
      }
    } catch (error) {
      if (this.debug) {
        console.warn('[LinkForty] Failed to load attribution context:', error);
      }
    }
    this.loaded = true;
  }

  /**
   * Record a deep-link open. The newest open supersedes the previous one
   * (last-click) and starts a new session. A no-op when no `linkId` is known
   * (e.g. an unresolved/organic open) — there is nothing to attribute to.
   *
   * @param linkId   The link the deep link resolved to (`DeepLinkData.linkId`).
   * @param clickId  Optional click id (link-level attribution works without it).
   */
  async recordDeepLinkOpen(
    linkId?: string | null,
    clickId?: string | null,
  ): Promise<void> {
    if (!linkId) {
      return;
    }

    this.active = {
      linkId,
      clickId: clickId ?? undefined,
      openedAt: new Date().toISOString(),
    };
    // A new deep-link open is the start of a new attributed journey.
    this.sessionId = generateSessionId();

    try {
      await AsyncStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(this.active));
    } catch (error) {
      if (this.debug) {
        console.warn('[LinkForty] Failed to persist attribution context:', error);
      }
    }

    if (this.debug) {
      console.log('[LinkForty] Attribution context set:', this.active, 'session:', this.sessionId);
    }
  }

  /**
   * The attribution fields to merge into every `trackEvent` payload. The
   * `sessionId` is always present; the link fields are absent until a deep link
   * has opened the app (organic activity stays organic).
   */
  getStamp(): AttributionStamp {
    return {
      attributedLinkId: this.active?.linkId,
      attributedClickId: this.active?.clickId,
      linkOpenedAt: this.active?.openedAt,
      sessionId: this.sessionId,
    };
  }

  /** The current session id (one app-open journey). */
  getSessionId(): string {
    return this.sessionId;
  }

  /** The current active attribution context, or null if none/organic. */
  getActive(): ActiveAttribution | null {
    return this.active;
  }

  /** Clear the persisted context and start a fresh session (used by clearData). */
  async clear(): Promise<void> {
    this.active = null;
    this.sessionId = generateSessionId();
    try {
      await AsyncStorage.removeItem(ATTRIBUTION_KEY);
    } catch (error) {
      if (this.debug) {
        console.warn('[LinkForty] Failed to clear attribution context:', error);
      }
    }
  }
}
