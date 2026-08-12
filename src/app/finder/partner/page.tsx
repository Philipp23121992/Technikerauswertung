import { EntryManager } from "@/components/finder/EntryManager";
import { FinderChrome } from "@/components/finder/FinderChrome";

export default function FinderPartnerPage() {
  return (
    <FinderChrome>
      <section className="finder-body">
        <EntryManager kind="PARTNER" title="Partner-Datenbank" />
      </section>
    </FinderChrome>
  );
}
