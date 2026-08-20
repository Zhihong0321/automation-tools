// RFC 6238 one-time codes, generated here instead of asked for.
//
// A one-time code cannot be stored - it is a function of the clock. What CAN be
// stored is the shared secret it is derived from, which is what the authenticator
// app was given at enrolment. With the secret, a code is produced at the instant
// of submit and the 30-second window stops being a race: no human is in the loop,
// nothing expires in flight, and re-login after a lost cookie needs no one awake.
//
// Without it, every login needs a person reading a phone, which is not automation.

import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648, no padding required) as the authenticator apps emit it. */
export function base32Decode(input: string): Buffer {
  const s = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of s) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error(`not base32: ${JSON.stringify(c)}`);
    bits += i.toString(2).padStart(5, '0');
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export interface TotpOptions {
  step?: number;
  digits?: number;
  algorithm?: string;
  /** Unix seconds. Defaults to now; parameterised so the value is testable. */
  at?: number;
}

export function totp(secret: string, opts: TotpOptions = {}): string {
  const step = opts.step ?? 30;
  const digits = opts.digits ?? 6;
  const at = opts.at ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(at / step);

  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);

  const mac = crypto.createHmac(opts.algorithm ?? 'sha1', base32Decode(secret)).update(msg).digest();
  const off = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Seconds the code produced right now stays valid. */
export function secondsLeft(step = 30, at = Math.floor(Date.now() / 1000)): number {
  return step - (at % step);
}

/**
 * A code with at least `minMs` of life left.
 *
 * The submit is a round trip through a browser: producing a code with two seconds
 * remaining and then spending three of them typing is how a correct secret still
 * fails. Waiting for the next window costs at most 30 seconds, once.
 */
export async function freshCode(secret: string, minSeconds = 5): Promise<string> {
  if (secondsLeft() < minSeconds) {
    await new Promise((r) => setTimeout(r, (secondsLeft() + 1) * 1000));
  }
  return totp(secret);
}

export interface OtpParams {
  secret: string;
  name?: string;
  issuer?: string;
  digits?: number;
  algorithm?: string;
}

/**
 * Accept whatever the user actually has in front of them.
 *
 * Three shapes, because asking someone to convert between them is asking them to
 * make a transcription error:
 *   - a bare base32 secret            JBSWY3DPEHPK3PXP
 *   - otpauth://totp/...?secret=...   the QR code's own contents
 *   - otpauth-migration://offline?data=...  Google Authenticator's "export
 *     accounts" link, which is a base64 protobuf holding one or more accounts
 */
export function parseSecret(input: string): OtpParams[] {
  const raw = input.trim();

  if (raw.startsWith('otpauth-migration://')) return parseMigration(raw);

  if (raw.startsWith('otpauth://')) {
    const u = new URL(raw.replace('otpauth://', 'https://'));
    const secret = u.searchParams.get('secret');
    if (!secret) throw new Error('otpauth URI has no secret parameter');
    return [
      {
        secret,
        name: decodeURIComponent(u.pathname.replace(/^\/+/, '')),
        issuer: u.searchParams.get('issuer') ?? undefined,
        digits: Number(u.searchParams.get('digits')) || 6,
        algorithm: (u.searchParams.get('algorithm') ?? 'SHA1').toLowerCase(),
      },
    ];
  }

  base32Decode(raw); // throws with a useful message if it is not a secret at all
  return [{ secret: raw.replace(/[\s-]/g, '').toUpperCase() }];
}

/**
 * Google Authenticator's export payload: a base64url protobuf of OtpParameters.
 *
 * Hand-decoded rather than pulled from a dependency - it is two wire types and
 * seven fields, and a migration link is the one form of the secret a person can
 * actually get out of their phone without re-enrolling.
 */
function parseMigration(uri: string): OtpParams[] {
  const data = new URL(uri.replace('otpauth-migration://', 'https://x/')).searchParams.get('data');
  if (!data) throw new Error('migration URI has no data parameter');
  const buf = Buffer.from(decodeURIComponent(data), 'base64');

  const ALG: Record<number, string> = { 1: 'sha1', 2: 'sha256', 3: 'sha512' };
  const DIG: Record<number, number> = { 1: 6, 2: 8 };

  const out: OtpParams[] = [];
  for (const [field, value] of readFields(buf)) {
    if (field !== 1 || !Buffer.isBuffer(value)) continue; // 1 = otp_parameters, repeated
    const p: OtpParams = { secret: '' };
    for (const [f, v] of readFields(value)) {
      if (f === 1 && Buffer.isBuffer(v)) p.secret = base32Encode(v);
      else if (f === 2 && Buffer.isBuffer(v)) p.name = v.toString();
      else if (f === 3 && Buffer.isBuffer(v)) p.issuer = v.toString();
      else if (f === 4 && typeof v === 'number') p.algorithm = ALG[v] ?? 'sha1';
      else if (f === 5 && typeof v === 'number') p.digits = DIG[v] ?? 6;
    }
    if (p.secret) out.push(p);
  }
  if (!out.length) throw new Error('migration payload held no accounts');
  return out;
}

/** Varints and length-delimited fields; anything else in this payload is a bug. */
function* readFields(b: Buffer): Generator<[number, Buffer | number]> {
  let i = 0;
  const varint = (): number => {
    let n = 0;
    let shift = 0;
    for (;;) {
      const c = b[i++]!;
      n |= (c & 0x7f) << shift;
      if (!(c & 0x80)) return n;
      shift += 7;
    }
  };
  while (i < b.length) {
    const key = varint();
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 0) yield [field, varint()];
    else if (wire === 2) {
      const len = varint();
      yield [field, b.subarray(i, i + len)];
      i += len;
    } else throw new Error(`unsupported protobuf wire type ${wire}`);
  }
}

function base32Encode(b: Buffer): string {
  let bits = '';
  for (const x of b) bits += x.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
