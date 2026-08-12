import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] py-10">
      <div className="site-shell flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="display text-lg font-semibold text-fire">Techniker Finder</p>
          <p className="mt-1 max-w-md text-sm text-ink-soft">
            Techniker- und Partnerdatenbank mit PLZ-Nähessuche und Routen auf der
            Deutschlandkarte.
          </p>
        </div>
        <div className="flex gap-5 text-sm font-semibold text-ink-soft">
          <Link href="/">Suche</Link>
          <Link href="/standorte">Standorte</Link>
          <Link href="/techniker">Techniker</Link>
          <Link href="/partner">Partner</Link>
        </div>
      </div>
    </footer>
  );
}
