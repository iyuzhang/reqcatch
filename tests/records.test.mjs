import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, captureRequestBody, trimRecords, formatRequest, formatResponse, formatRequestAndResponse, hasEmptyResponse, MAX_BODY_BYTES } from '../src/core/records.js';
import { DEFAULT_RULE } from '../src/core/rules.js';

const HTTP_RULE = { ...DEFAULT_RULE, httpEnabled: true };

test('classify_successAndMissingCodes', () => {
  for (const body of [{ code: 0 }, { code: '0' }, { data: 1 }, null]) {
    assert.deepEqual(classify(200, body).reasons, []);
  }
});

test('classify_httpAndBusinessErrors', () => {
  assert.deepEqual(classify(503, { code: 9 }, '', HTTP_RULE).reasons, ['HTTP 异常', '业务 code 异常']);
  assert.deepEqual(classify(200, { code: null }).reasons, []);
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

test('formatRequestAndResponse_omitsAllHeadersAndKeepsBodies', () => {
  const record = { method: 'POST', url: 'https://example.test/api?id=1', requestHeaders: [{ name: 'Cookie', value: 'synthetic-private-value' }], responseHeaders: [{ name: 'Set-Cookie', value: 'synthetic-response-value' }], requestBody: '{"id":42}', statusLine: 'HTTP/1.1 400 Bad Request', responseBody: '{"code":7}' };
  const text = formatRequestAndResponse(record);
  for (const expected of ['POST https://example.test/api?id=1', '{"id":42}', 'HTTP/1.1 400 Bad Request', '{"code":7}']) assert.ok(text.includes(expected));
  assert.doesNotMatch(text, /Cookie|synthetic-private-value|synthetic-response-value/);
});

test('classify_httpErrorResponseDoesNotImplyTransportFailure', () => {
  assert.deepEqual(classify(502, null, 'NS_ERROR_NET_ERROR_RESPONSE', HTTP_RULE).reasons, ['HTTP 异常']);
  assert.deepEqual(classify(null, null, 'NS_ERROR_NET_ERROR_RESPONSE').reasons, ['网络失败']);
  assert.deepEqual(classify(502, null, 'NS_ERROR_NET_RESET', HTTP_RULE).reasons, ['网络失败', 'HTTP 异常']);
});

test('formatResponse_emptyBodyDiffersFromUnavailableBody', () => {
  const record = { status: 502, statusLine: 'HTTP/1.1 502 Bad Gateway', responseHeaders: [{ name: 'Content-Length', value: '0' }], responseBody: null, responseNote: '非文本响应，未采集响应体', networkError: 'NS_ERROR_NET_ERROR_RESPONSE' };
  assert.match(formatResponse(record), /响应体为空/);
  assert.doesNotMatch(formatResponse(record), /非文本响应|未获取响应体/);
  assert.match(formatRequestAndResponse(record), /响应体为空/);
  assert.match(formatResponse({ responseBody: null }), /未获取响应体/);
  assert.equal(hasEmptyResponse({ ...record, responseHeaders: [...record.responseHeaders, { name: 'Transfer-Encoding', value: 'chunked' }] }), false);
  assert.equal(hasEmptyResponse({ method: 'HEAD' }), true);
});
