import { z } from 'zod';
import { detectBusinessResponse } from './business-presets.js';

const PATH_PATTERN = /^(?:[A-Za-z_$][\w$]*|\d+)(?:\.(?:[A-Za-z_$][\w$]*|\d+))*$/;
const BLOCKED_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
export const RULE_SCHEMA = z.object({
  mode: z.enum(['auto', 'custom']).default('custom'),
  httpEnabled: z.boolean().default(true),
  websocketEnabled: z.boolean().default(false),
  sseEnabled: z.boolean().default(false),
  xhrOnly: z.boolean().default(true),
  enabled: z.boolean(),
  fieldPath: z.string().trim().min(1).max(160).regex(PATH_PATTERN, '请使用 data.status 这样的字段路径')
    .refine(value => !value.split('.').some(segment => BLOCKED_SEGMENTS.has(segment)), '字段路径包含不支持的名称'),
  successValues: z.array(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).min(1).max(20),
});
export const DEFAULT_RULE = Object.freeze({ mode: 'auto', httpEnabled: true, websocketEnabled: false, sseEnabled: false, xhrOnly: true, enabled: true, fieldPath: 'code', successValues: Object.freeze([0, '0']) });

export function inspectBusinessResponse(body, rule = DEFAULT_RULE) {
  if (!rule.enabled) return { found: false, value: null, field: '', preset: '', success: true };
  if (rule.mode === 'auto') return detectBusinessResponse(body);
  const result = readBusinessValue(body, rule);
  return { ...result, field: rule.fieldPath, preset: 'custom', success: !result.found || rule.successValues.some(value => value === result.value) };
}

export function shouldCaptureType(type, rule = DEFAULT_RULE) {
  const normalized = type?.toLowerCase();
  if (normalized === 'websocket' && !rule.websocketEnabled) return false;
  if (normalized === 'eventsource' && !rule.sseEnabled) return false;
  return !rule.xhrOnly || ['xmlhttprequest', 'xhr', 'fetch'].includes(normalized);
}

export function readBusinessValue(body, rule = DEFAULT_RULE) {
  if (!rule.enabled) return { found: false, value: null };
  let value = body;
  for (const segment of rule.fieldPath.split('.')) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, segment)) return { found: false, value: null };
    value = value[segment];
  }
  return { found: true, value };
}
