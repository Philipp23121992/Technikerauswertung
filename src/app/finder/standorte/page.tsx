import { StandorteView } from "@/components/finder/StandorteView";
import { FinderChrome } from "@/components/finder/FinderChrome";

export default function FinderStandortePage() {
  return (
    <FinderChrome>
      <section className="finder-body">
        <StandorteView />
      </section>
    </FinderChrome>
  );
}
