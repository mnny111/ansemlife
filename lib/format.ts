export function usd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sol(n: number): string {
  return `${n.toFixed(4)} SOL`;
}
