import { useState } from "react";
import { useCurrentProjectId } from "@/hooks/use-project";
import { executionApi } from "./remote";
import type { Field as DatasetField, Row } from "./contracts";
import { decodeCsv, mapImport, parseImport, type ImportFormat } from "./import-data";
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
  const projectId = useCurrentProjectId();
  const isGuardrail =
    fields.some((f) => f.name === "messages") &&
    fields.some((f) => f.name === "has_issue");
  const [format, setFormat] = useState<ImportFormat | "xlsx">(
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
  function validateRows(parsed: Record<string, unknown>[], fieldMapping: Record<string, string>) {
    try {
      setPreview(mapImport(parsed, fields, fieldMapping));
      setError("");
    } catch (error) {
      setPreview(null);
      setError((error as Error).message);
    }
  }
  function loadRows(parsed: Record<string, unknown>[]) {
    setRows(parsed);
    const fieldMapping = Object.fromEntries(fields.map(field => [
      field.name, parsed.some(row => Object.hasOwn(row, field.name)) ? field.name : "",
    ]));
    setMapping(fieldMapping);
    validateRows(parsed, fieldMapping);
  }
  return (
    <Modal
      title="Import dataset records"
      description="Files are read and validated on upload. Check the field mapping and preview before appending records."
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Format">
          <Select
            value={format}
            disabled={loading}
            onChange={(e) => {
              setFormat(e.target.value as ImportFormat | "xlsx");
              reset();
            }}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="json">JSON array</option>
            <option value="jsonl">JSONL</option>
          </Select>
        </Field>
        <Field
          label="Upload file"
          hint="Up to 2 MB and 1,000 records. Excel files need one worksheet with column headers."
        >
          <Input
            type="file"
            accept=".csv,.xlsx,.json,.jsonl"
            disabled={loading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              reset();
              e.target.value = "";
              const extension = file.name.split(".").at(-1)?.toLowerCase();
              if (extension === "xlsx") setFormat("xlsx");
              if (file.size > 2 * 1024 * 1024) {
                setError("Import limit: 2 MB.");
                return;
              }
              setLoading(true);
              try {
                if (extension === "xlsx") {
                  const parsed = await executionApi<{rows: Record<string, unknown>[]}>(projectId, "datasets/actions/parse-xlsx", {
                    method: "POST",
                    headers: { "Content-Type": "application/octet-stream" },
                    body: file,
                  });
                  loadRows(parsed.rows);
                  return;
                }
                if (
                  extension === "csv" ||
                  extension === "json" ||
                  extension === "jsonl"
                ) {
                  const source = extension === "csv"
                    ? decodeCsv(await file.arrayBuffer())
                    : await file.text();
                  setRaw(source);
                  setFormat(extension);
                  loadRows(parseImport(source, extension));
                } else {
                  setError("Choose a CSV, XLSX, JSON, or JSONL file.");
                }
              } catch (error) {
                setError(error instanceof Error ? error.message : "Unable to read file.");
              } finally {
                setLoading(false);
              }
            }}
          />
        </Field>
      </div>
      {format === "xlsx" ? (!rows && <p className="text-xs text-muted-foreground">
        {loading ? "Reading workbook…" : "Upload an Excel workbook to map its columns."}
      </p>) : <>
      <Field label="Source data">
        <Textarea
          className="min-h-36 font-mono text-xs"
          disabled={loading}
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
            loadRows(parseImport(raw, format));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Read source & map fields
      </Button>
      </>}
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
                    const fieldMapping = { ...mapping, [field.name]: e.target.value };
                    setMapping(fieldMapping);
                    validateRows(rows, fieldMapping);
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
