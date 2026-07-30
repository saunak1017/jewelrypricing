import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredUsers } from '../functions/_utils.js';

test('reads the documented USER_PASSWORDS JSON object', () => {
  assert.deepEqual(configuredUsers({ USER_PASSWORDS: '{"Atit":"12219","Mayur":"09279"}' }), {
    Atit: '12219',
    Mayur: '09279'
  });
});

test('repairs a name/password pair pasted without surrounding braces', () => {
  assert.deepEqual(configuredUsers({ USER_PASSWORDS: '"Atit":"12219"' }), { Atit: '12219' });
});

test('accepts a JSON object accidentally stored as a quoted JSON string', () => {
  assert.deepEqual(configuredUsers({ USER_PASSWORDS: '"{\\"Atit\\":\\"12219\\"}"' }), { Atit: '12219' });
});

test('reports malformed USER_PASSWORDS instead of silently rejecting valid passwords', () => {
  assert.throws(() => configuredUsers({ USER_PASSWORDS: 'not-json' }), /USER_PASSWORDS is invalid/);
});

test('keeps the legacy and local fallback paths', () => {
  assert.deepEqual(configuredUsers({ ADMIN_PASSWORD: 'legacy' }), { Administrator: 'legacy' });
  assert.deepEqual(configuredUsers({}), { Administrator: 'admin123' });
});

test('reads individually configured Cloudflare password secrets', () => {
  assert.deepEqual(configuredUsers({
    Saunak_Password: 'saunak-secret',
    ATIT_PASSWORD: 'atit-secret',
    Mehul_PASSWORD: 'mehul-secret'
  }), {
    Saunak: 'saunak-secret',
    Atit: 'atit-secret',
    Mehul: 'mehul-secret'
  });
});

test('individual secrets can override one user in the JSON object', () => {
  assert.deepEqual(configuredUsers({
    USER_PASSWORDS: '{"Saunak":"old","Atit":"atit-secret"}',
    Saunak_Password: 'new'
  }), { Saunak: 'new', Atit: 'atit-secret' });
});
