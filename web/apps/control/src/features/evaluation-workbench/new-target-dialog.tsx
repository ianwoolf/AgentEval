import { useId, useRef, useState } from "react";
import { useWorkbench } from "./provider";
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from "./ui";

export function NewTargetDialog({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const { saveTarget } = useWorkbench();
  const formId = useId();
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [provider, setProvider] = useState<"f5" | "nemo guardrail">("nemo guardrail");
  const [definition, setDefinition] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="New target" description="Create a Guardrail target, then configure its dataset, execution environment and scorers."
    onClose={() => { if (!submitting.current) onClose(); }}
    footer={<>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId} disabled={busy}>{busy ? "Creating…" : "Create target"}</Button>
      </div>
    </>}>
    <form id={formId} className="space-y-5" onSubmit={async e => {
      e.preventDefault();
      if (submitting.current) return;
      if (!name.trim()) { setError("Target name is required."); return; }
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id.trim())) {
        setError("Target ID must start with a letter or number and contain only letters, numbers, dots, underscores or hyphens.");
        return;
      }
      submitting.current = true;
      setBusy(true); setError("");
      try {
        await saveTarget({id:id.trim(), name:name.trim(), kind:"GUARDRAIL", provider, version:1, definition:definition.trim()});
        onCreated();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        submitting.current = false; setBusy(false);
      }
    }}>
      <Field label="Target name *"><Input autoFocus required maxLength={200} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="e.g. Conversation safety" /></Field>
      <Field label="Target ID *" hint="A unique, stable identifier used by evaluation configurations and reports.">
        <Input required maxLength={128} value={id} disabled={busy} onChange={e=>setId(e.target.value)} placeholder="e.g. guardrail-conversation-safety" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target type"><Select value="GUARDRAIL" disabled><option value="GUARDRAIL">Guardrail</option></Select></Field>
        <Field label="Provider"><Select value={provider} disabled={busy} onChange={e=>setProvider(e.target.value as typeof provider)}>
          <option value="nemo guardrail">NeMo Guardrail</option><option value="f5">F5</option>
        </Select></Field>
      </div>
      <Field label="Description"><Textarea maxLength={4000} value={definition} disabled={busy} onChange={e=>setDefinition(e.target.value)} placeholder="Describe what this Guardrail evaluates." /></Field>
      <p className="text-xs text-muted-foreground">New targets start at version 1. Configure the target before triggering its first evaluation.</p>
    </form>
  </Modal>;
}
