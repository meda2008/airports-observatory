'use strict';

const MIN_TOKEN_LENGTH = 32;
const MIN_UNIQUE_CHARS = 8;

const WEAK_TOKEN_PATTERNS = [
  /^(.)\1+$/u,
  /^(.{1,16})\1+$/i,
  /(?:0123456789|1234567890|9876543210|0123456789abcdef|abcdefghij|qwertyuiop|asdfghjkl)/i,
  /change[-_]?me/i,
  /placeholder/i,
  /replace[-_]?with/i,
  /password/i,
  /admin[-_]?secret/i,
  /not[-_]?for[-_]?production/i,
  /your[-_]?(?:token|secret|admin|key|cred)/i,
  /example[-_]?(?:token|secret|admin|key|cred)/i,
  /default[-_]?(?:token|secret|admin|key|cred)/i,
  /(?:^example|^default|^your[-_]?token|^test[-_]?token|dummy[-_]?token|sample[-_]?token)/i
];

function validateAdminToken(rawToken) {
  const secret = String(rawToken || '').trim();
  if (secret.length < MIN_TOKEN_LENGTH) {
    throw Error('private_admin_credential_required');
  }
  if (new Set([...secret]).size < MIN_UNIQUE_CHARS || WEAK_TOKEN_PATTERNS.some((pattern) => pattern.test(secret))) {
    throw Error('weak_admin_credential_rejected');
  }
  return secret;
}

module.exports = {
  MIN_TOKEN_LENGTH,
  MIN_UNIQUE_CHARS,
  WEAK_TOKEN_PATTERNS,
  validateAdminToken,
  validateServiceToken: validateAdminToken
};
