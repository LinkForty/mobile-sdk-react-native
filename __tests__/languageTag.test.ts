import { describe, expect, it } from 'vitest';
import { normalizeLanguageTag } from '../src/languageTag';

describe('normalizeLanguageTag', () => {
  it.each([
    // BCP 47
    ['en-US', 'en-US'],
    ['en', 'en'],
    ['EN-us', 'en-US'],
    ['es-419', 'es-419'],
    ['en-ES-u-fw-mon-mu-celsius', 'en-ES'],
    ['zh-Hans-CN', 'zh-CN'],
    ['ca-ES-valencia', 'ca-ES'],
    ['en-x-private', 'en'],
    // Java Locale.toString() (I18nManager.localeIdentifier on Android)
    ['en_ES_#u-fw-mon-mu-celsius', 'en-ES'],
    ['zh_CN_#Hans', 'zh-CN'],
    ['sr_RS_#Latn', 'sr-RS'],
    ['en_US', 'en-US'],
    // ICU / Apple identifiers
    ['en_GB@rg=eszzzz', 'en-GB'],
    ['en_US@calendar=japanese', 'en-US'],
    ['en@rg=eszzzz', 'en'],
    ['zh-Hans_CN', 'zh-CN'],
    ['fil_PH', 'fil-PH'],
    // POSIX
    ['en_US.UTF-8', 'en-US'],
    ['  fr-FR  ', 'fr-FR'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLanguageTag(input)).toBe(expected);
  });

  it.each([['*'], [''], ['1234'], ['english-US'], ['-US'], ['_#Latn']])('rejects %j', (input) => {
    expect(normalizeLanguageTag(input)).toBeUndefined();
  });

  it('rejects non-strings', () => {
    expect(normalizeLanguageTag(undefined)).toBeUndefined();
    expect(normalizeLanguageTag(null)).toBeUndefined();
    expect(normalizeLanguageTag(['en-US'])).toBeUndefined();
  });

  it('never exceeds ten characters', () => {
    const long = 'en_ES_#u-fw-mon-mu-celsius-x-' + 'a'.repeat(200);
    expect(normalizeLanguageTag(long)!.length).toBeLessThanOrEqual(10);
  });
});
