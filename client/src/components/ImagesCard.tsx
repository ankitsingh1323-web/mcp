import { imageUrl } from "../lib/api";

export function ImagesCard({ imageIds, datasetName }: { imageIds: string[]; datasetName: string }) {
  return (
    <div className="card">
      <div className="card-title">
        🖼️ Extracted images
        <span className="tag">{datasetName}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {imageIds.map((id) => (
          <a key={id} href={imageUrl(id)} target="_blank" rel="noreferrer">
            <img
              src={imageUrl(id)}
              alt="Extracted from workbook"
              style={{
                maxWidth: 140,
                maxHeight: 140,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                objectFit: "contain",
                background: "var(--surface-1)",
              }}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
