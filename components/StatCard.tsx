export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-sm text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub ? <div className="text-xs text-white/40 mt-1">{sub}</div> : null}
    </div>
  );
}
