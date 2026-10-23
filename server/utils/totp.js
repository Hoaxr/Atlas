const crypto = require('node:crypto');
const QRCode = require('qrcode');

// RFC 4648 Base32 Alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer to a standard RFC 4648 Base32 string (unpadded).
 * @param {Buffer} buffer
 * @returns {string}
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Buffer.
 * @param {string} base32
 * @returns {Buffer}
 */
function base32Decode(base32) {
  const clean = String(base32).toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random cryptographically secure 20-byte (160-bit) Base32 secret.
 * @returns {string}
 */
function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

/**
 * Calculates a 6-digit TOTP token for a given counter according to RFC 6238.
 * @param {string} secret Base32 secret
 * @param {number} counter Time step counter
 * @returns {string} 6-digit code
 */
function generateTOTP(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return String(code).padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code against a secret within an allowed time window.
 * @param {string} token 6-digit token to verify
 * @param {string} secret Base32 secret
 * @param {number} window Time steps allowed before and after current (default: 1)
 * @param {number} step Step length in seconds (default: 30)
 * @returns {boolean}
 */
function verifyTOTP(token, secret, window = 1, step = 30) {
  if (!token || !secret) return false;
  const cleanToken = String(token).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / step);

  for (let i = -window; i <= window; i++) {
    const expected = generateTOTP(secret, currentCounter + i);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an otpauth:// URI for authenticator applications.
 * @param {object} params
 * @param {string} params.secret
 * @param {string} params.username
 * @param {string} [params.issuer='Atlas']
 * @returns {string}
 */
function generateOtpAuthUri({ secret, username, issuer = 'Atlas' }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(username || 'admin');
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a PNG data URI for the given otpauth URI.
 * @param {string} otpauthUri
 * @returns {Promise<string>}
 */
async function generateQRCodeDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

/**
 * Generates a set of single-use emergency backup recovery codes.
 * Format: 8-character hex code, e.g. "a1b2-c3d4"
 * @param {number} count
 * @returns {string[]}
 */
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex');
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/**
 * Hashes a backup code using SHA-256 for secure database storage.
 * @param {string} code
 * @returns {string}
 */
function hashBackupCode(code) {
  const clean = String(code).toLowerCase().replace(/[\s-]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Verifies if an input backup code matches any stored hashed code.
 * If matched, returns the index of the code so it can be consumed atomically.
 * @param {string} inputCode
 * @param {string[]} hashedCodes
 * @returns {number} Index of matched code, or -1 if no match
 */
function findMatchingBackupCodeIndex(inputCode, hashedCodes) {
  if (!inputCode || !Array.isArray(hashedCodes) || hashedCodes.length === 0) return -1;
  const targetHash = hashBackupCode(inputCode);
  const targetBuf = Buffer.from(targetHash, 'hex');

  for (let i = 0; i < hashedCodes.length; i++) {
    const candidateBuf = Buffer.from(hashedCodes[i], 'hex');
    if (candidateBuf.length === targetBuf.length && crypto.timingSafeEqual(candidateBuf, targetBuf)) {
      return i;
    }
  }

  return -1;
}

module.exports = {
  base32Encode,
  base32Decode,
  generateSecret,
  generateTOTP,
  verifyTOTP,
  generateOtpAuthUri,
  generateQRCodeDataUrl,
  generateBackupCodes,
  hashBackupCode,
  findMatchingBackupCodeIndex
};
