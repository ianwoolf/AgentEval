import type { Field, Row, Value } from "./contracts";
export type ImportFormat = "csv" | "json" | "jsonl";
const MAX_BYTES = 2 * 1024 * 1024;
export function parseImport(
  raw: string,
  format: ImportFormat,
): Record<string, unknown>[] {
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    throw new Error("Demo import limit: 2 MB.");
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("Import is empty.");
  let rows: unknown;
  if (format === "csv") {
    const table: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    let closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
          closed = true;
        } else cell += c;
      } else if (c === '"') {
        if (cell || closed) throw new Error("Invalid CSV quoting.");
        quoted = true;
      } else if (c === "," || c === "\n" || c === "\r") {
        row.push(cell);
        cell = "";
        closed = false;
        if (c !== ",") {
          table.push(row);
          row = [];
          if (c === "\r" && text[i + 1] === "\n") i++;
        }
      } else {
        if (closed) throw new Error("Unexpected text after CSV quote.");
        cell += c;
      }
    }
    if (quoted) throw new Error("Unterminated CSV quote.");
    row.push(cell);
    table.push(row);
    const headers = table.shift()!.map((h) => h.trim());
    if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
      throw new Error("CSV headers must be nonempty and unique.");
    rows = table.map((cells, i) => {
      if (cells.length !== headers.length)
        throw new Error(
          `CSV row ${i + 1}: column count does not match the header.`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
    });
  } else {
    try {
      rows =
        format === "json"
          ? JSON.parse(text)
          : text
              .split(/\r?\n/)
              .filter((l) => l.trim())
              .map((line) => JSON.parse(line));
    } catch {
      throw new Error(
        `Invalid ${format.toUpperCase()}. Use ${format === "json" ? "an array of objects" : "one JSON object per line"}.`,
      );
    }
  }
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
  )
    throw new Error("Import must contain nonempty object rows.");
  if (rows.length > 1000) throw new Error("Demo import limit: 1,000 rows.");
  return rows as Record<string, unknown>[];
}
export function validateFields(fields: Field[]) {
  if (!fields.length || !fields.some((f) => f.role === "input"))
    throw new Error("Add at least one input field.");
  if (
    fields.some(
      (f) =>
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name) ||
        ["__proto__", "constructor", "prototype"].includes(f.name),
    )
  )
    throw new Error(
      "Use safe field names: letters, numbers and underscores; start with a letter or underscore.",
    );
  if (new Set(fields.map((f) => f.name)).size !== fields.length)
    throw new Error("Field names must be unique.");
}
export function mapImport(
  rows: Record<string, unknown>[],
  fields: Field[],
  mapping: Record<string, string>,
): Row[] {
  validateFields(fields);
  return rows.map((row, i) =>
    Object.fromEntries(
      fields.flatMap((field) => {
        const source = mapping[field.name];
        const raw =
          source && Object.hasOwn(row, source) ? row[source] : undefined;
        const fail = (message: string): never => {
          throw new Error(`Row ${i + 1}, ${field.name}: ${message}`);
        };
        if (raw === undefined || raw === null || raw === "") {
          if (field.required) fail("required value is missing.");
          return [];
        }
        let value: Value;
        switch (field.type) {
          case "string":
            if (typeof raw !== "string") fail("expected text.");
            value = raw as string;
            break;
          case "number": {
            if (typeof raw !== "number" && typeof raw !== "string")
              fail("expected a number.");
            const number = Number(raw);
            if (
              !Number.isFinite(number) ||
              (typeof raw === "string" && !raw.trim())
            )
              fail("expected a finite number.");
            value = number;
            break;
          }
          case "boolean":
            if (![true, false, "true", "false"].includes(raw as boolean))
              fail("expected true or false.");
            value = raw === true || raw === "true";
            break;
          case "json":
            try {
              value =
                typeof raw === "string"
                  ? JSON.parse(raw)
                  : JSON.parse(JSON.stringify(raw));
            } catch {
              return fail("invalid JSON.");
            }
            break;
        }
        return [[field.name, value]];
      }),
    ),
  );
}
