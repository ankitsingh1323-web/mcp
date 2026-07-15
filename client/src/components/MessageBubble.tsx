import type { ChatEntry, MaterializeResult } from "../lib/types";
import { CardStack } from "./CardStack";

export function MessageBubble({
  entry,
  onMaterialized,
}: {
  entry: ChatEntry;
  onMaterialized: (datasetId: string, result: MaterializeResult) => void;
}) {
  const isUser = entry.role === "user";

  return (
    <div className={`msg-row ${isUser ? "user" : "assistant"}`}>
      <div className={`avatar ${isUser ? "user" : "assistant"}`}>{isUser ? "You" : "AI"}</div>
      <div className="msg-body">
        {entry.text !== undefined && (
          <div className="bubble">
            {entry.pending ? (
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            ) : (
              entry.text || " "
            )}
          </div>
        )}
        {entry.cards && <CardStack cards={entry.cards} onMaterialized={onMaterialized} />}
      </div>
    </div>
  );
}
