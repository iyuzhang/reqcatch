import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULE_SCHEMA, readBusinessValue, shouldCaptureType } from '../src/core/rules.js';
import { classify, classifyRecord, getTransport } from '../src/core/records.js';
import { displayUrl } from '../src/ui/record-view.js';

test('shouldCaptureType_filtersBrowserTypesAndPreservesLegacySettings', () => {
  const legacy = { enabled: true, fieldPath: 'code', successValues: [0] };
  const rule = RULE_SCHEMA.parse(legacy);
  assert.equal(rule.xhrOnly, true);
  for (const type of ['xmlhttprequest', 'XHR', 'Fetch']) assert.equal(shouldCaptureType(type, { ...rule, xhrOnly: true }), true);
  for (const type of ['script', 'Stylesheet', 'image', 'main_frame', 'Document', 'EventSource', undefined]) {
    assert.equal(shouldCaptureType(type, { ...rule, xhrOnly: true }), false);
    assert.equal(shouldCaptureType(type, { ...rule, xhrOnly: false, sseEnabled: true }), true);
  }
  assert.equal(RULE_SCHEMA.safeParse({ ...legacy, xhrOnly: 'true' }).success, false);
});

test('classify_customNestedFieldAndTypedSuccessValues', () => {
  const rule = { enabled: true, fieldPath: 'data.status', successValues: [200, 'OK', true] };
  assert.deepEqual(classify(200, { code: 7, data: { status: 'OK' } }, '', rule).reasons, []);
  assert.deepEqual(classify(200, { data: { status: '200' } }, '', rule).reasons, ['业务状态异常']);
  assert.equal(classify(200, { data: { status: false } }, '', rule).code, false);
  assert.deepEqual(classify(200, { unrelated: 1 }, '', rule).reasons, []);
  assert.equal(readBusinessValue({ data: [{ status: 'OK' }] }, { ...rule, fieldPath: 'data.0.status' }).value, 'OK');
});

test('classify_disabledBusinessRulePreservesHttpAndNetworkFailures', () => {
  const rule = { httpEnabled: true, enabled: false, fieldPath: 'code', successValues: [0] };
  assert.deepEqual(classify(502, { code: 7 }, '', rule).reasons, ['HTTP 异常']);
  assert.deepEqual(classify(null, null, 'NS_ERROR_NET_RESET', rule).reasons, ['网络失败']);
});

test('ruleSchema_rejectsExecutableAndPrototypePaths', () => {
  for (const fieldPath of ['data[0].status', '__proto__.status', 'constructor.name', '(() => 0)()']) {
    assert.equal(RULE_SCHEMA.safeParse({ enabled: true, fieldPath, successValues: [0] }).success, false);
  }
  assert.equal(RULE_SCHEMA.safeParse({ enabled: true, fieldPath: 'data.status', successValues: [] }).success, false);
});

test('classifyRecord_streamDisconnectIsDistinctFromAbortAndHttpFailure', () => {
  const record = { rule: { sseEnabled: true, httpEnabled: true, enabled: false }, status: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/event-stream' }], networkError: 'NS_ERROR_NET_RESET' };
  assert.deepEqual(classifyRecord(record).reasons, ['流连接中断']);
  assert.deepEqual(classifyRecord({ ...record, networkError: 'NS_BINDING_ABORTED' }).reasons, ['请求已取消']);
  assert.deepEqual(classifyRecord({ ...record, networkError: '' }).reasons, []);
  assert.deepEqual(classifyRecord({ ...record, status: 502 }).reasons, ['网络失败', 'HTTP 异常']);
  assert.equal(getTransport({ url: 'https://example.test/stream' }), 'HTTP');
  assert.equal(getTransport({ url: 'wss://example.test/events' }), 'WebSocket');
});

test('displayUrl_hidesCredentialParametersWithoutChangingOriginalUrl', () => {
  const url = 'https://example.test/api?accessToken=synthetic-secret&page=2';
  assert.doesNotMatch(displayUrl(url, true), /synthetic-secret/);
  assert.match(displayUrl(url), /page=2/);
  assert.match(url, /synthetic-secret/);
});
