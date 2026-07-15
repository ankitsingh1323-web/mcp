import { useRef, useState } from "react";

export function ChatComposer({
  onSend,
  onUpload,
  busy,
}: {
  onSend: (text: string) => void;
  onUpload: (files: File[]) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  }

  return (
    <div className="composer">
      <div className="composer-inner">
        <button
          className="round-btn"
          title="Attach a file"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".csv,.json,.xlsx,.xls,.pdf,.docx,.zip,.tar,.gz,.tgz"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) onUpload(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <textarea
          ref={taRef}
          rows={1}
          placeholder="Ask about your data — trends, row counts, PII risks, anything…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="round-btn primary"
          onClick={submit}
          disabled={busy || !value.trim()}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
