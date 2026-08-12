import { PlzSearch } from "@/components/finder/PlzSearch";
import { FinderChrome } from "@/components/finder/FinderChrome";

export default function FinderHomePage() {
  return (
    <FinderChrome>
      <section className="finder-hero">
        <p className="finder-hero-title">Techniker Finder</p>
        <h1 className="finder-hero-sub">
          PLZ eingeben — die 5 nächsten Techniker oder Partner mit Route auf der
          Deutschlandkarte.
        </h1>
      </section>
      <section className="finder-body">
        <PlzSearch />
      </section>
    </FinderChrome>
  );
}
