export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-6">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/40">{sub}</div> : null}
    </div>
  );
}
