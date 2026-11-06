const SUCCESS_WORDS = new Set(['ok', 'success', 'succeeded', 'successful']);
const FAILURE_WORDS = new Set(['error', 'fail', 'failed', 'failure']);
const OAUTH_ERRORS = new Set(['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'access_denied', 'invalid_token', 'insufficient_scope', 'server_error', 'temporarily_unavailable']);
const BOOLEAN_FIELDS = ['success', 'succeeded', 'ok', 'isSuccess', 'Success', 'Succeeded', 'IsSuccess'];
const CODE_FIELDS = ['code', 'Code', 'errcode', 'errno', 'retcode', 'retCode', 'errorCode', 'error_code'];
const STATUS_FIELDS = ['status', 'statusCode', 'status_code', 'StatusCode'];

export function detectBusinessResponse(body) {
  if (!isObject(body)) return { found: false, value: null, field: '', preset: '', success: true };
  const signals = [];
  for (const field of BOOLEAN_FIELDS) {
    if (Object.hasOwn(body, field) && typeof body[field] === 'boolean') signals.push(signal(field, body[field], body[field], 'boolean'));
  }
  for (const field of CODE_FIELDS) {
    if (!Object.hasOwn(body, field)) continue;
    const success = codeSuccess(body[field], field.toLowerCase() === 'code');
    if (success !== null) signals.push(signal(field, body[field], success, 'code'));
  }
  for (const field of STATUS_FIELDS) {
    if (!Object.hasOwn(body, field)) continue;
    const success = statusSuccess(body[field]);
    if (success !== null) signals.push(signal(field, body[field], success, 'status'));
  }
  collectErrorSignals(body, signals);
  return signals.find(entry => !entry.success) || signals[0] || { found: false, value: null, field: '', preset: '', success: true };
}

function signal(field, value, success, preset) {
  return { found: true, field, value, success, preset };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^[+-]?\d{1,15}$/.test(value.trim())) return Number(value.trim());
  return null;
}

function codeSuccess(value, allowHttpSuccess) {
  const number = numericValue(value);
  if (number !== null) return number === 0 || (allowHttpSuccess && number === 200);
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase();
  if (SUCCESS_WORDS.has(word)) return true;
  if (FAILURE_WORDS.has(word)) return false;
  return null;
}

function statusSuccess(value) {
  const number = numericValue(value);
  if (number === 0 || (number >= 200 && number < 300)) return true;
  if (number >= 400 && number < 600) return false;
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase();
  if (SUCCESS_WORDS.has(word)) return true;
  if (FAILURE_WORDS.has(word)) return false;
  return null;
}

function collectErrorSignals(body, signals) {
  if (Array.isArray(body.errors) && body.errors.length && body.errors.every(isErrorEntry)) {
    signals.push(signal('errors', body.errors, false, 'errors'));
  }
  if (typeof body.error === 'string' && (OAUTH_ERRORS.has(body.error) || typeof body.error_description === 'string')) {
    signals.push(signal('error', body.error, false, 'oauth'));
  } else if (isObject(body.error) && typeof body.error.message === 'string' && body.error.message.trim()) {
    signals.push(signal('error', body.error, false, 'error-object'));
  }
}

function isErrorEntry(value) {
  return isObject(value) && ['message', 'detail', 'title'].some(field => typeof value[field] === 'string' && value[field].trim());
}
