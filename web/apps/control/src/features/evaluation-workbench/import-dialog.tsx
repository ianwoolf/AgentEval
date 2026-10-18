import { useState } from "react";
import type { Field as DatasetField, Row } from "./contracts";
import { mapImport, parseImport, type ImportFormat } from "./import-data";
import {
  Button,
  ErrorText,
  Field,
  Input,
  JsonPreview,
  Modal,
  Select,
  Textarea,
} from "./ui";
export function ImportDialog({
  fields,
  onImport,
  onClose,
}: {
  fields: DatasetField[];
  onImport(rows: Row[]): void;
  onClose(): void;
}) {
  const isGuardrail =
    fields.some((f) => f.name === "messages") &&
    fields.some((f) => f.name === "has_issue");
  const [format, setFormat] = useState<ImportFormat>(
    isGuardrail ? "json" : "csv",
  );
  const [raw, setRaw] = useState(
    isGuardrail
      ? JSON.stringify(
          [
            {
              messages: [
                { role: "system", content: "Protect private information." },
                { role: "user", content: "How do I reset my own password?" },
              ],
              has_issue: false,
              category: "benign",
            },
          ],
          null,
          2,
        )
      : "question,answer,category\nHow can I reset my password?,Use the secure reset link.,support",
  );
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const reset = () => {
    setRows(null);
    setPreview(null);
    setError("");
  };
  const columns = [...new Set(rows?.flatMap((row) => Object.keys(row)) ?? [])];
  return (
    <Modal
      title="Import dataset records"
      description="Upload → map fields → validate → confirm. Existing rows are kept; valid rows are appended together."
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Format">
          <Select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as ImportFormat);
              reset();
            }}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON array</option>
            <option value="jsonl">JSONL</option>
          </Select>
        </Field>
        <Field
          label="Upload file"
          hint="Up to 2 MB and 1,000 records in this demo."
        >
          <Input
            type="file"
            accept=".csv,.json,.jsonl"
            disabled={loading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              reset();
              if (file.size > 2 * 1024 * 1024) {
                setError("Demo import limit: 2 MB.");
                return;
              }
              setLoading(true);
              try {
                setRaw(await file.text());
                const extension = file.name.split(".").at(-1);
                if (
                  extension === "csv" ||
                  extension === "json" ||
                  extension === "jsonl"
                )
                  setFormat(extension);
              } catch {
                setError("Unable to read file.");
              } finally {
                setLoading(false);
              }
            }}
          />
        </Field>
      </div>
      <Field label="Source data">
        <Textarea
          className="min-h-36 font-mono text-xs"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            reset();
          }}
        />
      </Field>
      <Button
        disabled={loading}
        variant="outline"
        onClick={() => {
          try {
            const parsed = parseImport(raw, format);
            setRows(parsed);
            setMapping(
              Object.fromEntries(
                fields.map((f) => [
                  f.name,
                  Object.hasOwn(parsed[0]!, f.name) ? f.name : "",
                ]),
              ),
            );
            setPreview(null);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Read source & map fields
      </Button>
      {rows && (
        <div className="space-y-4">
          <h3 className="font-medium">Field mapping · {rows.length} records</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <Field
                key={field.name}
                label={`${field.name}${field.required ? " *" : ""}`}
                hint={`${field.type} · ${field.role}`}
              >
                <Select
                  value={mapping[field.name] ?? ""}
                  onChange={(e) => {
                    setMapping({ ...mapping, [field.name]: e.target.value });
                    setPreview(null);
                  }}
                >
                  <option value="">Do not map</option>
                  {columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              try {
                setPreview(mapImport(rows, fields, mapping));
                setError("");
              } catch (e) {
                setPreview(null);
                setError((e as Error).message);
              }
            }}
          >
            Validate import
          </Button>
        </div>
      )}
      {preview && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700">
            {preview.length} valid records · showing the first 5
          </p>
          <JsonPreview value={preview.slice(0, 5)} />
        </div>
      )}
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!preview}
          onClick={() => {
            if (preview) {
              onImport(preview);
              onClose();
            }
          }}
        >
          Import {preview?.length ?? 0} records
        </Button>
      </div>
    </Modal>
  );
}
