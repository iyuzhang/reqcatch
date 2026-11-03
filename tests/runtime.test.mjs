import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/core/runtime.js';

function fixture(saved = {}, onToggle) {
  let listener;
  let persisted;
  const api = {
    runtime: { id: 'test-extension', getURL: path => `moz-extension://test/${path}`, onMessage: { addListener(callback) { listener = callback; } } },
    storage: { local: { async get() { return saved; }, async set(value) { persisted = value; } } },
    tabs: { async get(id) { return { id, url: 'https://example.test/' }; } },
  };
  const action = { async setBadgeText() {}, async setBadgeBackgroundColor() {} };
  const runtime = createRuntime(api, action, onToggle);
  const sender = { id: 'test-extension', url: 'moz-extension://test/panel.html?tabId=1' };
  return {
    runtime,
    get persisted() { return persisted; },
    send(input, source = sender) {
      return new Promise(resolve => {
        const accepted = listener(input, source, resolve);
        if (!accepted) resolve(undefined);
      });
    },
  };
}

test('runtime_rejectsMessagesFromWebsitesAndInvalidCommands', async () => {
  const value = fixture();
  await value.runtime.ready;
  assert.equal(await value.send({ action: 'toggle', tabId: 1 }, { id: 'test-extension', url: 'https://example.test/' }), undefined);
  assert.equal((await value.send({ action: 'toggle', tabId: '1' })).error, '无效操作');
  assert.equal(value.runtime.origins.size, 0);
});

test('runtime_failedCaptureDoesNotEnableOrPersistSite', async () => {
  const value = fixture({}, async () => { throw new Error('Capture unavailable'); });
  const result = await value.send({ action: 'toggle', tabId: 1 });
  assert.match(result.error, /Capture unavailable/);
  assert.equal(value.runtime.origins.size, 0);
  assert.equal(value.persisted, undefined);
});

test('runtime_validatesStoredRecordsAndPersistsExplicitOptIn', async () => {
  const value = fixture({ origins: ['https://example.test'], records: [{ url: 'invalid' }] });
  await value.runtime.ready;
  assert.equal(value.runtime.origins.size, 0);
  const result = await value.send({ action: 'toggle', tabId: 1 });
  assert.equal(result.enabled, true);
  assert.deepEqual(value.persisted.origins, ['https://example.test']);
});
