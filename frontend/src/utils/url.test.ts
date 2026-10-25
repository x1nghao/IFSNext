import { test } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { isSafeHttpUrl } from './url.ts';

test('放行 http/https 绝对链接', () => {
  strictEqual(isSafeHttpUrl('https://example.com/form'), true);
  strictEqual(isSafeHttpUrl('http://example.com/form'), true);
  strictEqual(isSafeHttpUrl('HTTPS://EXAMPLE.COM'), true);
});

test('拦截伪协议与相对路径', () => {
  strictEqual(isSafeHttpUrl('javascript:alert(1)'), false);
  strictEqual(isSafeHttpUrl('JAVASCRIPT:alert(1)'), false);
  strictEqual(isSafeHttpUrl('data:text/html,<b>x</b>'), false);
  strictEqual(isSafeHttpUrl('vbscript:x'), false);
  strictEqual(isSafeHttpUrl('//example.com/form'), false);
  strictEqual(isSafeHttpUrl('/relative/path'), false);
});

test('拦截空值与非法输入', () => {
  strictEqual(isSafeHttpUrl(''), false);
  strictEqual(isSafeHttpUrl('not a url'), false);
});
