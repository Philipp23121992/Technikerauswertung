import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(198,40,40,0.14)] bg-white/92 backdrop-blur-md">
      <div className="site-shell flex h-16 items-center justify-between gap-4">
        <Link href="/finder" className="display text-xl font-bold tracking-tight text-fire">
          Techniker Finder
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold text-ink-soft sm:gap-6">
          <Link href="/finder" className="hover:text-fire">
            PLZ-Suche
          </Link>
          <Link href="/finder/standorte" className="hover:text-fire">
            Standorte
          </Link>
          <Link href="/finder/techniker" className="hover:text-fire">
            Techniker-DB
          </Link>
          <Link href="/finder/partner" className="hover:text-fire">
            Partner-DB
          </Link>
        </nav>
      </div>
    </header>
  );
}
