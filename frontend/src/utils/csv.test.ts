import { test } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { escapeCsvField, buildCsv, buildCsvWithBom } from './csv.ts';

test('escapeCsvField 普通字段原样输出', () => {
  strictEqual(escapeCsvField('Alpha'), 'Alpha');
  strictEqual(escapeCsvField(12345), '12345');
  strictEqual(escapeCsvField(''), '');
  strictEqual(escapeCsvField(null), '');
  strictEqual(escapeCsvField(undefined), '');
});

test('escapeCsvField 转义含逗号/引号/换行的字段', () => {
  strictEqual(escapeCsvField('a,b'), '"a,b"');
  strictEqual(escapeCsvField('say "hi"'), '"say ""hi"""');
  strictEqual(escapeCsvField('line1\nline2'), '"line1\nline2"');
  strictEqual(escapeCsvField('a\r\nb'), '"a\r\nb"');
});

test('buildCsv 表头与行拼接，CRLF 行尾', () => {
  const csv = buildCsv(['Name', 'Status'], [['Alpha', 'TRUE'], ['Be,ta', 'FALSE']]);
  strictEqual(csv, 'Name,Status\r\nAlpha,TRUE\r\n"Be,ta",FALSE');
});

test('buildCsvWithBom 以 UTF-8 BOM 开头', () => {
  const csv = buildCsvWithBom(['Name'], [['Alpha']]);
  strictEqual(csv.startsWith('\uFEFF'), true);
  strictEqual(csv.slice(1), 'Name\r\nAlpha');
});
