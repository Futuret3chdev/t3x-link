import { StarlinkDesk } from "@/components/t3x/starlink-desk";
import { StarlinkLink } from "@/components/t3x/starlink-link";
import { TrackerDesk } from "@/components/t3x/tracker-desk";
import type { LinkModel } from "@/components/t3x/use-link";

export function PlanetsDesk({ model }: { model: LinkModel }) {
  return (
    <div className="grid gap-4">
      <StarlinkLink model={model} />
      <TrackerDesk model={model} />
      <StarlinkDesk model={model} />
    </div>
  );
}
