/**
 * 生の数値文字列を桁区切りカンマ付きで表示用に整形する。
 * 小数点・マイナス符号は保持。非数値はそのまま返す（ユーザーが打ち途中の状態に干渉しない）。
 */
export function formatNumericDisplay(raw: string): string {
  if (raw === "" || raw === "-" || raw === "." || raw === "-.") return raw;
  const match = raw.match(/^(-?)(\d*)(\.\d*)?$/);
  if (!match) return raw;
  const [, sign = "", intPart = "", decPart = ""] = match;
  if (intPart === "") return raw;
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withCommas}${decPart}`;
}

/** 表示用のカンマを除去した raw 文字列を返す */
export function stripCommas(display: string): string {
  return display.replace(/,/g, "");
}
