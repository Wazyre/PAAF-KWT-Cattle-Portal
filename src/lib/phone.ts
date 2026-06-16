// Kuwait mobile validation and normalization (strips country code, enforces 8-digit 5/6/9 prefix).
// Kuwait mobile numbers: 8 digits beginning with 5, 6, or 9.
// (2 = landline, so it is intentionally rejected for a personal mobile.)
export const KUWAIT_MOBILE_RE = /^[569]\d{7}$/;

/** Strip spaces/dashes and an optional Kuwait country code (965 / 00965). */
export function normalizeKuwaitMobile(input: string): string {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("00965")) d = d.slice(5);
  else if (d.length === 11 && d.startsWith("965")) d = d.slice(3);
  return d;
}

// True if the input (after country-code stripping) is a valid Kuwait mobile number.
export function isValidKuwaitMobile(input: string): boolean {
  return KUWAIT_MOBILE_RE.test(normalizeKuwaitMobile(input));
}

export const KUWAIT_MOBILE_ERROR =
  "يرجى إدخال رقم هاتف كويتي صحيح مكوّن من 8 أرقام يبدأ بـ 5 أو 6 أو 9.";
