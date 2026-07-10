/**
 * Regex for checking standard RFC 5322 email syntax
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Regex for checking standard phone syntax: optionally starting with '+',
 * followed by digits, spaces, or hyphens (7 to 20 chars)
 */
const PHONE_REGEX = /^[+]?[0-9\s-]{7,20}$/;

/**
 * Regex for checking name syntax: letters, spaces, hyphens, and apostrophes (2 to 100 chars)
 */
const NAME_REGEX = /^[a-zA-Z\s'-]{2,100}$/;

/**
 * Regex for checking a valid 64-character SHA-256 hex string (or reset token)
 */
const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

function isValidPhone(phone) {
  if (phone === null || phone === undefined || phone === '') return true; // phone can be optional/nullable
  if (typeof phone !== 'string') return false;
  return PHONE_REGEX.test(phone.trim());
}

function isValidName(name) {
  if (typeof name !== 'string') return false;
  return NAME_REGEX.test(name.trim());
}

function isValidSha256(hash) {
  if (typeof hash !== 'string') return false;
  return SHA256_REGEX.test(hash.trim());
}

function isValidResetToken(token) {
  if (typeof token !== 'string') return false;
  return SHA256_REGEX.test(token.trim());
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidName,
  isValidSha256,
  isValidResetToken
};
