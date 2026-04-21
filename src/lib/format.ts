const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("ja-JP", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

export function formatYen(value: number): string {
  return currencyFormatter.format(value);
}

export function formatYenCompact(value: number): string {
  return compactFormatter.format(value);
}
