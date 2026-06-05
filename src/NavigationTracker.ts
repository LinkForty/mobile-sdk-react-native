/**
 * NavigationTracker — auto-emits `screen_view` events from React Navigation.
 *
 * When `autoTrackNavigation` is enabled and a `navigationRef` is provided, the
 * SDK subscribes to React Navigation's `'state'` event and emits a `screen_view`
 * for the active route on each change — debounced (rapid transitions collapse to
 * the final screen) and deduped (re-renders that don't change the screen are
 * ignored). The event flows through the normal `trackEvent` pipeline, so it
 * automatically carries the active deep-link attribution context + session.
 *
 * Everything here is guarded: a missing/malformed `navigationRef` (or an app
 * that doesn't use react-navigation) results in a no-op, never a crash. The SDK
 * has no compile-time dependency on `@react-navigation/native` — the ref is
 * typed structurally (see NavigationContainerRefLike).
 *
 * See `.brandon/sit-237-auto-nav-tracking/plan.md` Phase A.
 */

import type { NavigationContainerRefLike, NavigationRouteLike } from './types';

/** Emit function the tracker calls — bound to the SDK's `trackEvent`. */
export type ScreenEventEmitter = (
  name: string,
  properties: Record<string, unknown>,
) => void;

export interface NavigationTrackerOptions {
  /** Collapse rapid transitions; emit only the settled screen. Default 350ms. */
  debounceMs?: number;
  /** Attach (sanitized) route params to the event. Default true. */
  captureParams?: boolean;
  debug?: boolean;
}

const DEFAULT_DEBOUNCE_MS = 350;
const SCREEN_VIEW_EVENT = 'screen_view';
const MAX_PARAM_STRING_LENGTH = 256;

/**
 * Keys whose values are dropped from captured params as likely PII. Matched
 * case-insensitively as substrings. Conservative-by-default given LinkForty has
 * paying customers; apps can disable param capture entirely via `captureParams`.
 */
const PII_KEY_PATTERNS = [
  'email',
  'password',
  'passwd',
  'secret',
  'token',
  'auth',
  'apikey',
  'api_key',
  'ssn',
  'phone',
  'address',
  'credit',
  'card',
  'cvv',
  'dob',
  'birth',
];

function looksLikePII(key: string): boolean {
  const k = key.toLowerCase();
  return PII_KEY_PATTERNS.some((p) => k.includes(p));
}

/**
 * Reduce arbitrary route params to a safe, flat set: primitives only (string /
 * number / boolean), strings capped, PII-looking keys redacted, and nested
 * objects/arrays/functions dropped. Returns undefined when nothing survives.
 */
export function sanitizeScreenParams(
  params: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!params || typeof params !== 'object') {
    return undefined;
  }

  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (looksLikePII(key)) {
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > MAX_PARAM_STRING_LENGTH
        ? value.slice(0, MAX_PARAM_STRING_LENGTH)
        : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
    // Objects, arrays, functions, null, undefined are intentionally dropped.
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export class NavigationTracker {
  private readonly navigationRef: NavigationContainerRefLike;
  private readonly emit: ScreenEventEmitter;
  private readonly debounceMs: number;
  private readonly captureParams: boolean;
  private readonly debug: boolean;

  private unsubscribe: (() => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScreen: string | null = null;
  private started = false;

  constructor(
    navigationRef: NavigationContainerRefLike,
    emit: ScreenEventEmitter,
    options: NavigationTrackerOptions = {},
  ) {
    this.navigationRef = navigationRef;
    this.emit = emit;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.captureParams = options.captureParams ?? true;
    this.debug = options.debug ?? false;
  }

  /**
   * Subscribe to navigation changes. No-op (with a debug warning) if the ref
   * doesn't expose the expected react-navigation methods. Idempotent.
   */
  start(): void {
    if (this.started) {
      return;
    }

    if (
      !this.navigationRef ||
      typeof this.navigationRef.addListener !== 'function' ||
      typeof this.navigationRef.getCurrentRoute !== 'function'
    ) {
      if (this.debug) {
        console.warn(
          '[LinkForty] autoTrackNavigation enabled but navigationRef is missing or not a React Navigation container ref — screen tracking is disabled.',
        );
      }
      return;
    }

    try {
      const listener = this.navigationRef.addListener('state', () => {
        this.scheduleCapture();
      });

      if (typeof listener === 'function') {
        this.unsubscribe = listener;
      } else if (listener && typeof listener.remove === 'function') {
        this.unsubscribe = () => listener.remove?.();
      } else {
        this.unsubscribe = null;
      }

      this.started = true;

      // Capture the initial screen if the tree is already mounted.
      const ready = typeof this.navigationRef.isReady === 'function'
        ? this.navigationRef.isReady()
        : true;
      if (ready) {
        this.captureCurrentScreen();
      }

      if (this.debug) {
        console.log('[LinkForty] Navigation tracking started');
      }
    } catch (error) {
      if (this.debug) {
        console.warn('[LinkForty] Failed to start navigation tracking:', error);
      }
    }
  }

  /** Unsubscribe and clear any pending debounce. Idempotent. */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.unsubscribe) {
      try {
        this.unsubscribe();
      } catch {
        // ignore teardown errors
      }
      this.unsubscribe = null;
    }
    this.started = false;
    this.lastScreen = null;
  }

  private scheduleCapture(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.captureCurrentScreen();
    }, this.debounceMs);
  }

  private captureCurrentScreen(): void {
    let route: NavigationRouteLike | undefined;
    try {
      route = this.navigationRef.getCurrentRoute();
    } catch (error) {
      if (this.debug) {
        console.warn('[LinkForty] getCurrentRoute failed:', error);
      }
      return;
    }

    if (!route || !route.name) {
      return;
    }

    // Dedupe: ignore state changes that don't move to a different screen.
    if (route.name === this.lastScreen) {
      return;
    }

    const previousScreen = this.lastScreen;
    this.lastScreen = route.name;

    const properties: Record<string, unknown> = { screen: route.name };
    if (previousScreen) {
      properties.previousScreen = previousScreen;
    }
    if (this.captureParams) {
      const params = sanitizeScreenParams(route.params);
      if (params) {
        properties.params = params;
      }
    }

    try {
      this.emit(SCREEN_VIEW_EVENT, properties);
    } catch (error) {
      if (this.debug) {
        console.warn('[LinkForty] Failed to emit screen_view:', error);
      }
    }
  }
}
