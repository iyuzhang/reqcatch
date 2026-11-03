import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, captureRequestBody, trimRecords, formatRequest, formatResponse, MAX_BODY_BYTES } from '../src/core/records.js';

test('classify_successAndMissingCodes', () => {
  for (const body of [{ code: 0 }, { code: '0' }, { data: 1 }, null]) {
    assert.deepEqual(classify(200, body).reasons, []);
  }
});

test('classify_httpAndBusinessErrors', () => {
  assert.deepEqual(classify(503, { code: 9 }).reasons, ['HTTP 异常', '业务 code 异常']);
  assert.deepEqual(classify(200, { code: null }).reasons, ['业务 code 异常']);
});

test('classify_cancellationVersusNetworkError', () => {
  assert.deepEqual(classify(null, null, 'NS_BINDING_ABORTED').reasons, ['请求已取消']);
  assert.deepEqual(classify(null, null, 'NS_ERROR_UNKNOWN_HOST').reasons, ['网络失败']);
});

test('captureRequestBody_splitUtf8AndLimit', () => {
  const encoded = new TextEncoder().encode('{"name":"中文"}');
  const body = captureRequestBody({ raw: [{ bytes: encoded.slice(0, 10).buffer }, { bytes: encoded.slice(10).buffer }] });
  assert.equal(body.text, '{"name":"中文"}');
  const large = captureRequestBody({ raw: [{ bytes: new Uint8Array(MAX_BODY_BYTES + 1).buffer }] });
  assert.match(large.note, /截断/);
  assert.equal(large.text.length, MAX_BODY_BYTES);
});

test('trimRecords_boundsStorageAndKeepsNewest', () => {
  const values = Array.from({ length: 110 }, (_, id) => ({ id, text: 'x'.repeat(50000) }));
  const kept = trimRecords(values);
  assert.equal(kept.at(-1).id, 109);
  assert.ok(kept.length < 100);
  assert.ok(JSON.stringify(kept).length < 2 * 1024 * 1024);
});

test('formatRequestAndResponse_containsHeadersAndBodies', () => {
  const record = { method: 'POST', url: 'https://example.test/api', requestHeaders: [{ name: 'Content-Type', value: 'application/json' }], requestBody: '{"id":1}', statusLine: 'HTTP/1.1 500 Internal Server Error', responseHeaders: [{ name: 'x-trace-id', value: 'trace-1' }], responseBody: '{"code":7}' };
  assert.match(formatRequest(record), /Content-Type: application\/json\n\n\{"id":1\}/);
  assert.match(formatResponse(record), /x-trace-id: trace-1\n\n\{"code":7\}/);
  assert.match(formatResponse({ networkError: 'NS_BINDING_ABORTED' }), /未收到 HTTP 响应/);
});
