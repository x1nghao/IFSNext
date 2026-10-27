import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { parseIgnoredFormUrls, addIgnoredFormUrl } from './formCheck.ts';

test('解析：空值与坏 JSON 返回空名单', () => {
  deepStrictEqual(parseIgnoredFormUrls(null), []);
  deepStrictEqual(parseIgnoredFormUrls(''), []);
  deepStrictEqual(parseIgnoredFormUrls('not json'), []);
  deepStrictEqual(parseIgnoredFormUrls('{"a":1}'), []);
});

test('解析：剔除非字符串项', () => {
  deepStrictEqual(
    parseIgnoredFormUrls('["https://docs.google.com/forms/d/abc"]'),
    ['https://docs.google.com/forms/d/abc']
  );
  deepStrictEqual(parseIgnoredFormUrls('["https://a", 42, null, {}]'), ['https://a']);
});

test('追加：新链接排在末尾且不改入参', () => {
  const list = ['https://a'];
  const next = addIgnoredFormUrl(list, 'https://b');
  deepStrictEqual(next, ['https://a', 'https://b']);
  deepStrictEqual(list, ['https://a']);
});

test('追加：已存在的链接返回原名单引用', () => {
  const list = ['https://a'];
  strictEqual(addIgnoredFormUrl(list, 'https://a'), list);
});

test('追加：空链接不进入名单', () => {
  const list: string[] = [];
  strictEqual(addIgnoredFormUrl(list, ''), list);
});
