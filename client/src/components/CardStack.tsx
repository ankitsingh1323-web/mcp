import type { AnalysisCard, MaterializeResult } from "../lib/types";
import { DataTableCard } from "./DataTableCard";
import { DocumentCard } from "./DocumentCard";
import { InsightsCard } from "./InsightsCard";
import { ObsCard } from "./ObsCard";
import { PiiHealthCard } from "./PiiHealthCard";
import { SummaryCard } from "./SummaryCard";

export function CardStack({
  cards,
  onMaterialized,
}: {
  cards: AnalysisCard[];
  onMaterialized: (datasetId: string, result: MaterializeResult) => void;
}) {
  return (
    <div className="card-stack">
      {cards.map((card, i) => {
        switch (card.kind) {
          case "summary":
            return <SummaryCard key={i} profile={card.profile} />;
          case "document":
            return <DocumentCard key={i} profile={card.profile} />;
          case "insights":
            return <InsightsCard key={i} insights={card.insights} />;
          case "table":
            return (
              <DataTableCard
                key={i}
                profile={card.profile}
                ddl={card.ddl}
                materialized={card.materialized}
                onMaterialized={(result) => onMaterialized(card.profile.id, result)}
              />
            );
          case "pii":
            return <PiiHealthCard key={i} report={card.report} />;
          case "obs":
            return <ObsCard key={i} report={card.report} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
