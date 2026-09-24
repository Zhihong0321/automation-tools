// agy reports its account limit as plain text, including a relative reset time.
// Keep the parser separate from the process loop so the same duration is used
// for the broker report and the worker's own sleep.
export function quotaCooldownMs(message) {
  const text = String(message ?? '');
  if (!/individual quota reached/i.test(text)) return null;
  const reset = /resets?\s+in\s+((?:(?:\d+)\s*d(?:ays?)?\s*)?(?:(?:\d+)\s*h(?:ours?)?\s*)?(?:(?:\d+)\s*m(?:in(?:utes?)?)?\s*)?(?:(?:\d+)\s*s(?:ec(?:onds?)?)?\s*)?)/i.exec(text);
  const parts = reset?.[1]?.matchAll(/(\d+)\s*(d(?:ays?)?|h(?:ours?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?))/gi);
  let ms = 0;
  let found = false;
  for (const part of parts ?? []) {
    found = true;
    const unit = part[2][0].toLowerCase();
    ms += Number(part[1]) * ({ d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 })[unit];
  }
  // An omitted or malformed reset must still stop the retry loop.
  return Math.min(Math.max(found ? ms : 60 * 60_000, 60_000) + 5_000, 7 * 86_400_000);
}
