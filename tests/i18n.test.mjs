import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage, translate } from '../src/ui/i18n.js';

test('resolveLanguage_followsBrowserAndValidatesPreferences', () => {
  for (const language of ['zh', 'zh-CN', 'zh-TW']) assert.equal(resolveLanguage('auto', language), 'zh-CN');
  for (const language of ['en-US', 'fr', 'ja']) assert.equal(resolveLanguage('auto', language), 'en');
  assert.equal(resolveLanguage('en', 'zh-CN'), 'en');
  assert.equal(resolveLanguage('zh-CN', 'en-US'), 'zh-CN');
  assert.equal(resolveLanguage('invalid', 'en-US'), 'en');
});

test('translate_handlesStaticDynamicAndOriginalText', () => {
  assert.equal(translate('设置', 'en'), 'Settings');
  assert.equal(translate('设置', 'zh-CN'), '设置');
  assert.equal(translate('https://example.test · 监控中', 'en'), 'https://example.test · Monitoring');
  assert.equal(translate('展开剩余 1,234 字符', 'en'), 'Show remaining 1,234 characters');
  assert.equal(translate('请求已取消 · HTTP 异常', 'en'), 'Cancelled · HTTP error');
  assert.equal(translate('GET /api', 'en'), 'GET /api');
});
