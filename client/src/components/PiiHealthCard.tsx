import type { PiiReport } from "../lib/types";
import { Gauge } from "./Gauge";

const CATEGORY_LABEL: Record<string, string> = {
  email: "Email address",
  phone: "Phone number",
  ssn: "Social security number",
  credit_card: "Credit card number",
  ip_address: "IP address",
  person_name: "Person name",
  physical_address: "Physical address",
  date_of_birth: "Date of birth",
  national_id: "National ID",
  api_key_or_secret: "API key / secret",
};

export function PiiHealthCard({ report }: { report: PiiReport }) {
  return (
    <div className="card">
      <div className="card-title">
        🔒 PII health check
        <span className="tag">{report.columnsScanned} columns scanned</span>
      </div>
      <Gauge score={report.overallScore} riskLevel={report.riskLevel} />
      {report.clean ? (
        <div className="pii-clean" style={{ marginTop: 12 }}>
          ✓ No PII patterns detected
        </div>
      ) : (
        <div className="pii-findings">
          {report.findings.map((f) => (
            <div className="pii-finding-row" key={f.column}>
              <span className={`badge badge-${f.severity}`}>{f.severity}</span>
              <span className="pii-finding-col">{f.column}</span>
              <span className="pii-finding-cat">{CATEGORY_LABEL[f.category] ?? f.category}</span>
              <span className="pii-finding-sample">{f.sampleMasked.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
