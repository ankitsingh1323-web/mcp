import type { AnalysisCard, MaterializeResult } from "../lib/types";
import { AssociationsCard } from "./AssociationsCard";
import { DataTableCard } from "./DataTableCard";
import { DocumentCard } from "./DocumentCard";
import { EntitiesCard } from "./EntitiesCard";
import { ImagesCard } from "./ImagesCard";
import { InsightsCard } from "./InsightsCard";
import { JoinSuggestionsCard } from "./JoinSuggestionsCard";
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
          case "images":
            return <ImagesCard key={i} imageIds={card.imageIds} datasetName={card.datasetName} />;
          case "entities":
            return <EntitiesCard key={i} entities={card.entities} datasetName={card.datasetName} />;
          case "associations":
            return <AssociationsCard key={i} associations={card.associations} />;
          case "joins":
            return <JoinSuggestionsCard key={i} suggestions={card.suggestions} />;
          case "obs":
            return <ObsCard key={i} report={card.report} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
