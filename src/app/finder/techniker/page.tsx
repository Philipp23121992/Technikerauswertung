import { EntryManager } from "@/components/finder/EntryManager";
import { FinderChrome } from "@/components/finder/FinderChrome";

export default function FinderTechnikerPage() {
  return (
    <FinderChrome>
      <section className="finder-body">
        <EntryManager kind="TECHNICIAN" title="Techniker-Datenbank" />
      </section>
    </FinderChrome>
  );
}
