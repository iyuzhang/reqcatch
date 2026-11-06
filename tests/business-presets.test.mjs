import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, classifyRecord } from '../src/core/records.js';
import { DEFAULT_RULE, RULE_SCHEMA, shouldCaptureType } from '../src/core/rules.js';

const CASES = [
  ['zero-code', { code: 0 }, { code: 7 }, 'code'],
  ['http-code', { code: 200, msg: 'OK' }, { code: 500, msg: 'Failed' }, 'code'],
  ['string-code', { code: '00000' }, { code: '401' }, 'code'],
  ['word-code', { code: 'SUCCESS' }, { code: 'ERROR' }, 'code'],
  ['errcode', { errcode: 0 }, { errcode: 40001 }, 'errcode'],
  ['errno', { errno: '0' }, { errno: '-1' }, 'errno'],
  ['success', { success: true }, { success: false }, 'success'],
  ['succeeded', { succeeded: true }, { succeeded: false }, 'succeeded'],
  ['ok', { ok: true }, { ok: false }, 'ok'],
  ['status-word', { status: 'success' }, { status: 'failed' }, 'status'],
  ['status-number', { status: 204 }, { status: 422 }, 'status'],
  ['statusCode', { statusCode: 201 }, { statusCode: 400, message: 'Invalid' }, 'statusCode'],
  ['status_code', { status_code: '200' }, { status_code: '500' }, 'status_code'],
  ['graphql', { data: { name: 'synthetic' } }, { data: null, errors: [{ message: 'Failed' }] }, 'errors'],
  ['json-api', { data: [] }, { errors: [{ status: '422', detail: 'Invalid' }] }, 'errors'],
  ['oauth', { access_token: 'synthetic' }, { error: 'invalid_grant', error_description: 'Expired' }, 'error'],
  ['error-object', { error: null }, { error: { message: 'Failed', code: 'synthetic' } }, 'error'],
  ['problem-details', { status: 200 }, { type: 'about:blank', title: 'Invalid', status: 400 }, 'status'],
  ['pascal-code', { Code: 200 }, { Code: 500 }, 'Code'],
  ['pascal-success', { Success: true }, { Success: false }, 'Success'],
  ['isSuccess', { isSuccess: true }, { isSuccess: false }, 'isSuccess'],
  ['retCode', { retCode: 0 }, { retCode: 1001 }, 'retCode'],
  ['error_code', { error_code: 0 }, { error_code: 200 }, 'error_code'],
];

for (const [name, success, failure, field] of CASES) {
  test(`classify_autoPreset_${name}`, () => {
    assert.deepEqual(classify(200, success).reasons, []);
    const result = classify(200, failure);
    assert.equal(result.reasons.length, 1);
    assert.equal(result.businessField, field);
    assert.equal(result.businessChecked, true);
    assert.notEqual(result.businessPreset, 'custom');
  });
}

test('classify_autoSkipsUnknownNestedAndDomainValues', () => {
  for (const body of [null, [], 7, 'error', { code: null }, { code: 'US' }, { status: 'pending' }, { status: 1 }, { success: 'false' }, { data: { code: 500 } }, { errors: [] }, { errors: ['red'] }, { errors: [{ count: 2 }] }, { error: 'error budget' }]) {
    assert.deepEqual(classify(200, body).reasons, []);
    assert.equal(classify(200, body).businessChecked, false);
  }
});

test('classify_autoExplicitFailuresOverrideConflictingSuccessMarkers', () => {
  for (const body of [{ success: true, code: 500 }, { code: 0, success: false }, { code: 200, errors: [{ message: 'Partial failure' }] }, { ok: true, error: { message: 'Failed' } }]) {
    assert.equal(classify(200, body).reasons.length, 1);
  }
});

test('classify_customRulesOverridePresetsAndLegacySettingsKeepTheirMeaning', () => {
  const legacy = RULE_SCHEMA.parse({ enabled: true, fieldPath: 'code', successValues: [200] });
  assert.equal(legacy.mode, 'custom');
  assert.deepEqual(classify(200, { code: 200, success: false }, '', legacy).reasons, []);
  assert.equal(classify(200, { code: 0 }, '', legacy).reasons.length, 1);
  assert.equal(DEFAULT_RULE.mode, 'auto');
});

test('classify_transportSwitchesDefaultOffAndRemainIndependent', () => {
  assert.deepEqual(classify(502, null).reasons, []);
  assert.deepEqual(classify(502, null, '', { ...DEFAULT_RULE, httpEnabled: true }).reasons, ['HTTP 异常']);
  assert.deepEqual(classify(200, { success: false }).reasons, ['业务状态异常']);
  assert.deepEqual(classify(null, null, 'Connection reset').reasons, ['网络失败']);
  for (const [type, url, headers, setting] of [
    ['WebSocket', 'wss://example.test/ws', [], 'websocketEnabled'],
    ['Fetch', 'https://example.test/events', [{ name: 'Content-Type', value: 'text/event-stream' }], 'sseEnabled'],
  ]) {
    const record = { type, url, status: 200, networkError: 'Connection reset', responseHeaders: headers };
    assert.deepEqual(classifyRecord(record).reasons, []);
    assert.equal(classifyRecord({ ...record, rule: { ...DEFAULT_RULE, [setting]: true } }).reasons.length, 1);
  }
  assert.equal(shouldCaptureType('WebSocket'), false);
  assert.equal(shouldCaptureType('EventSource'), false);
  assert.equal(shouldCaptureType('WebSocket', { ...DEFAULT_RULE, websocketEnabled: true, xhrOnly: false }), true);
  assert.equal(shouldCaptureType('WebSocket', { ...DEFAULT_RULE, websocketEnabled: true, xhrOnly: true }), false);
  assert.deepEqual(classifyRecord({ type: 'EventSource', status: 503, rule: { ...DEFAULT_RULE, sseEnabled: true } }).reasons, ['SSE 连接失败']);
  assert.deepEqual(classifyRecord({ type: 'WebSocket', status: 503, rule: { ...DEFAULT_RULE, websocketEnabled: true } }).reasons, ['WebSocket 握手失败']);
});
