import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

/** How long the install report waits for Play. */
export const INSTALL_REFERRER_TIMEOUT_MS = 2000;

/** How often the stored referrer is checked while Play answers. */
const POLL_INTERVAL_MS = 200;

/** What react-native-device-info returns until Play has answered, or without Play. */
const NOT_READY = 'unknown';

interface ReadOptions {
  os?: string;
  getInstallReferrer?: () => Promise<string>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * The referrer Google Play recorded for this install, on Android. A LinkForty
 * link puts its click id in the referrer of every Play listing it sends a
 * visitor to, so the server can match the install to that click exactly.
 *
 * react-native-device-info asks Play when the app starts and stores the
 * answer; until then it returns 'unknown'. This waits for the answer, up to the
 * timeout. Resolves null on iOS, without Play (another store, a sideload),
 * when Play doesn't answer in time, and on any error: the install is then
 * matched by fingerprint. Never rejects.
 */
export async function readPlayInstallReferrer(options: ReadOptions = {}): Promise<string | null> {
  const {
    os = Platform.OS,
    getInstallReferrer = () => DeviceInfo.getInstallReferrer(),
    timeoutMs = INSTALL_REFERRER_TIMEOUT_MS,
    pollIntervalMs = POLL_INTERVAL_MS,
  } = options;
  if (os !== 'android') return null;

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await getInstallReferrer();
      if (typeof value === 'string' && value !== NOT_READY) {
        return value.trim() !== '' ? value : null;
      }
    } catch {
      // Unavailable: keep trying until the deadline, then give up.
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }
}
