import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AttributionContext } from '../src/AttributionContext';

const ATTRIBUTION_KEY = '@linkforty:attribution';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('AttributionContext', () => {
  it('starts organic: only a sessionId, no link fields', () => {
    const ctx = new AttributionContext();
    const stamp = ctx.getStamp();

    expect(stamp.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(stamp.attributedLinkId).toBeUndefined();
    expect(stamp.attributedClickId).toBeUndefined();
    expect(stamp.linkOpenedAt).toBeUndefined();
    expect(ctx.getActive()).toBeNull();
  });

  it('records a deep-link open: stamps the link, persists it, and rotates the session', async () => {
    const ctx = new AttributionContext();
    const firstSession = ctx.getSessionId();

    await ctx.recordDeepLinkOpen('link-A');

    const stamp = ctx.getStamp();
    expect(stamp.attributedLinkId).toBe('link-A');
    expect(stamp.linkOpenedAt).toEqual(expect.any(String));
    expect(stamp.sessionId).not.toBe(firstSession); // new open == new session

    // persisted for the next launch
    const raw = await AsyncStorage.getItem(ATTRIBUTION_KEY);
    expect(JSON.parse(raw as string)).toMatchObject({ linkId: 'link-A' });
  });

  it('carries an optional clickId when provided', async () => {
    const ctx = new AttributionContext();
    await ctx.recordDeepLinkOpen('link-A', 'click-1');
    expect(ctx.getStamp().attributedClickId).toBe('click-1');
  });

  it('supersedes with last-click: a newer open replaces the previous link', async () => {
    const ctx = new AttributionContext();
    await ctx.recordDeepLinkOpen('link-A');
    const sessionA = ctx.getSessionId();

    await ctx.recordDeepLinkOpen('link-B');

    expect(ctx.getStamp().attributedLinkId).toBe('link-B');
    expect(ctx.getSessionId()).not.toBe(sessionA);
  });

  it('ignores organic opens (no linkId): active context and session are unchanged', async () => {
    const ctx = new AttributionContext();
    await ctx.recordDeepLinkOpen('link-A');
    const session = ctx.getSessionId();

    await ctx.recordDeepLinkOpen(undefined);
    await ctx.recordDeepLinkOpen(null);
    await ctx.recordDeepLinkOpen('');

    expect(ctx.getStamp().attributedLinkId).toBe('link-A');
    expect(ctx.getSessionId()).toBe(session);
  });

  it('restores the persisted context on a new (cold-start) instance, with a fresh session', async () => {
    const first = new AttributionContext();
    await first.recordDeepLinkOpen('link-A', 'click-1');
    const firstSession = first.getSessionId();

    // Simulate a cold start: a brand new instance loads persisted state.
    const next = new AttributionContext();
    await next.load();

    expect(next.getActive()).toMatchObject({ linkId: 'link-A', clickId: 'click-1' });
    expect(next.getStamp().attributedLinkId).toBe('link-A');
    // Session is in-memory: a cold start is a new session.
    expect(next.getSessionId()).not.toBe(firstSession);
  });

  it('clear() wipes the persisted context and starts a fresh session', async () => {
    const ctx = new AttributionContext();
    await ctx.recordDeepLinkOpen('link-A');
    const before = ctx.getSessionId();

    await ctx.clear();

    expect(ctx.getActive()).toBeNull();
    expect(ctx.getStamp().attributedLinkId).toBeUndefined();
    expect(ctx.getSessionId()).not.toBe(before);
    expect(await AsyncStorage.getItem(ATTRIBUTION_KEY)).toBeNull();
  });

  it('load() is idempotent and never throws', async () => {
    const ctx = new AttributionContext();
    await expect(ctx.load()).resolves.toBeUndefined();
    await expect(ctx.load()).resolves.toBeUndefined();
  });
});
