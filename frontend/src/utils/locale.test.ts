import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { detectBrowserLocale, APP_LOCALES } from './locale.ts';

test('APP_LOCALES 覆盖全部支持的语言（main.ts 恢复本地语言时按它校验）', () => {
  deepStrictEqual([...APP_LOCALES].sort(), ['en-US', 'zh-CN', 'zh-TW']);
});

test('繁体中文变体归入 zh-TW', () => {
  strictEqual(detectBrowserLocale('zh-TW'), 'zh-TW');
  strictEqual(detectBrowserLocale('zh-HK'), 'zh-TW');
  strictEqual(detectBrowserLocale('zh-MO'), 'zh-TW');
  strictEqual(detectBrowserLocale('zh-Hant'), 'zh-TW');
  strictEqual(detectBrowserLocale('zh-Hant-TW'), 'zh-TW');
  strictEqual(detectBrowserLocale('zh-Hant-HK'), 'zh-TW');
});

test('简体中文变体归入 zh-CN', () => {
  strictEqual(detectBrowserLocale('zh'), 'zh-CN');
  strictEqual(detectBrowserLocale('zh-CN'), 'zh-CN');
  strictEqual(detectBrowserLocale('zh-Hans'), 'zh-CN');
  strictEqual(detectBrowserLocale('zh-SG'), 'zh-CN');
});

test('其他语言归入 en-US', () => {
  strictEqual(detectBrowserLocale('en-US'), 'en-US');
  strictEqual(detectBrowserLocale('en'), 'en-US');
  strictEqual(detectBrowserLocale('fr-FR'), 'en-US');
  strictEqual(detectBrowserLocale('ja'), 'en-US');
});

test('空值兜底为 en-US', () => {
  strictEqual(detectBrowserLocale(''), 'en-US');
  strictEqual(detectBrowserLocale(null), 'en-US');
  strictEqual(detectBrowserLocale(undefined), 'en-US');
});
