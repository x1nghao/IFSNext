import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { messages } from '../locales/index.ts';
import { APP_LOCALES } from './locale.ts';
import type { AppLocale } from './locale.ts';

// 递归收集文案树的叶子 key 路径（叶子必须是字符串）
const leafPaths = (node: unknown, prefix = ''): string[] => {
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafPaths(value, prefix ? `${prefix}.${key}` : key)
  );
};

// 提取一段文案里的插值占位符（{n}、{q} 等）
const placeholdersOf = (text: string): string[] =>
  Array.from(text.matchAll(/\{(\w+)\}/g), m => m[1]!).sort();

const localeEntries = APP_LOCALES.map(locale => ({
  locale,
  keys: new Set(leafPaths(messages[locale])),
}));

const base = { locale: 'zh-CN' as AppLocale, keys: new Set(leafPaths(messages['zh-CN'])) };

test('三语言文案 key 结构完全一致（多译/漏译立刻暴露）', () => {
  for (const { locale, keys } of localeEntries) {
    deepStrictEqual(
      [...keys].sort(),
      [...base.keys].sort(),
      `${locale} 与基准语言 ${base.locale} 的文案 key 不一致`
    );
  }
});

// en-US 的 list.countSuffix 刻意为空：「Total 12」不需要「人」这类后缀量词（zh 系需要）
const ALLOWED_EMPTY_KEYS = new Set(['list.countSuffix']);

test('每个文案叶子都是非空字符串', () => {
  for (const { locale, keys } of localeEntries) {
    for (const key of keys) {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages[locale]);
      strictEqual(typeof value, 'string', `${locale} 的 ${key} 应为字符串`);
      if (ALLOWED_EMPTY_KEYS.has(key)) continue;
      strictEqual((value as string).length > 0, true, `${locale} 的 ${key} 不应为空`);
    }
  }
});

test('插值占位符在各语言间保持一致（漏写 {n} 会渲染成字面量）', () => {
  const baseValues = new Map<string, string>();
  for (const key of base.keys) {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages[base.locale]);
    baseValues.set(key, value as string);
  }
  for (const { locale, keys } of localeEntries) {
    for (const key of keys) {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages[locale]);
      deepStrictEqual(
        placeholdersOf(value as string),
        placeholdersOf(baseValues.get(key)!),
        `${locale} 的 ${key} 占位符与 ${base.locale} 不一致`
      );
    }
  }
});
