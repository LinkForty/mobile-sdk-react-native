/**
 * Reduce a locale identifier to `language` or `language-REGION`.
 *
 * The platforms report the device locale in different shapes, and the same
 * user settings produce different strings on each:
 *
 * - BCP 47 tags with script and extension subtags: `zh-Hans-CN`,
 *   `en-ES-u-fw-mon-mu-celsius` (Android, with regional preferences set)
 * - Java `Locale.toString()`, which React Native's `I18nManager` reports on
 *   Android: `en_ES_#u-fw-mon-mu-celsius`, `zh_CN_#Hans`
 * - ICU / Apple identifiers with keywords: `en_GB@rg=eszzzz`,
 *   `en_US@calendar=japanese`
 * - POSIX names: `en_US.UTF-8`
 *
 * Attribution compares only the language, and the browser side of a click
 * reports `language-REGION`, so that is all the SDK sends:
 *
 *   en_ES_#u-fw-mon-mu-celsius → en-ES
 *   en_GB@rg=eszzzz            → en-GB
 *   zh-Hans-CN                 → zh-CN
 *   es-419                     → es-419
 *
 * Returns undefined for anything that does not start with a 2–3 letter
 * language subtag, so the caller can fall back to another source.
 */
export function normalizeLanguageTag(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const subtags = value.trim().split(/[@.#]/)[0].split(/[-_]/);
  const language = subtags[0];
  if (!/^[a-z]{2,3}$/i.test(language)) return undefined;

  let region: string | undefined;
  for (const subtag of subtags.slice(1)) {
    // A single-character subtag starts an extension or private-use section.
    if (subtag.length <= 1) break;
    if (/^[a-z]{2}$/i.test(subtag) || /^\d{3}$/.test(subtag)) {
      region = subtag.toUpperCase();
      break;
    }
  }
  return region ? `${language.toLowerCase()}-${region}` : language.toLowerCase();
}
