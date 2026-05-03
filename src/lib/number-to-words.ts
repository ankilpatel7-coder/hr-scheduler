/**
 * Convert a number to its English word representation, paystub-style.
 * Example: 48.03 → "Forty-Eight And 03/100 Dollars"
 *          310.61 → "Three Hundred Ten And 61/100 Dollars"
 *          1307.23 → "One Thousand Three Hundred Seven And 23/100 Dollars"
 */

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function under1000(n: number): string {
  if (n === 0) return "";
  const out: string[] = [];
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)] + " Hundred");
    n %= 100;
  }
  if (n >= 20) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    out.push(o ? `${TENS[t]}-${ONES[o]}` : TENS[t]);
  } else if (n > 0) {
    out.push(ONES[n]);
  }
  return out.join(" ");
}

export function amountToWords(amount: number): string {
  // Split dollars and cents
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);

  let dollarWords = "";
  if (dollars === 0) {
    dollarWords = "Zero";
  } else {
    const billions = Math.floor(dollars / 1_000_000_000);
    const millions = Math.floor((dollars % 1_000_000_000) / 1_000_000);
    const thousands = Math.floor((dollars % 1_000_000) / 1000);
    const remainder = dollars % 1000;

    const parts: string[] = [];
    if (billions > 0) parts.push(under1000(billions) + " Billion");
    if (millions > 0) parts.push(under1000(millions) + " Million");
    if (thousands > 0) parts.push(under1000(thousands) + " Thousand");
    if (remainder > 0) parts.push(under1000(remainder));
    dollarWords = parts.join(" ");
  }

  const centsStr = String(cents).padStart(2, "0");
  return `${dollarWords} And ${centsStr}/100 Dollars`;
}

/** Format with leading asterisks like "***********48.03" — width param sets total chars. */
export function asteriskAmount(amount: number, width = 14): string {
  const formatted = amount.toFixed(2);
  const stars = Math.max(0, width - formatted.length);
  return "*".repeat(stars) + formatted;
}
