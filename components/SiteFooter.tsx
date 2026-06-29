export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 pt-16">
        <h2 className="select-none text-center font-display text-[18vw] uppercase leading-none tracking-tight text-white/90 sm:text-[14vw]">
          Ansem<span className="text-accent">Life</span>
        </h2>
        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-xs text-white/40 sm:flex-row">
          <span>© {2026} AnsemLife. Not financial advice.</span>
          <span>Read live from AsterDex · the site never trades.</span>
        </div>
      </div>
    </footer>
  );
}
