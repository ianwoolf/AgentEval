import { useId, useRef, useState } from "react";
import type { Target } from "./contracts";
import { useWorkbench } from "./provider";
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from "./ui";

export function NewTargetDialog({ initial, onClose, onCreated }: { initial?: Target; onClose(): void; onCreated(): void }) {
  const { saveTarget } = useWorkbench();
  const formId = useId();
  const submitting = useRef(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? crypto.randomUUID());
  const [guardrailId, setGuardrailId] = useState(initial?.guardrail_id ?? initial?.id ?? "");
  const [provider, setProvider] = useState<"f5" | "nemo guardrail">(initial?.provider ?? "nemo guardrail");
  const [definition, setDefinition] = useState(initial?.definition ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title={initial ? "Edit evaluation" : "New evaluation"} description="Create a Guardrail target, then configure its dataset, execution environment and scorers."
    onClose={() => { if (!submitting.current) onClose(); }}
    footer={<>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId} disabled={busy}>{busy ? "Saving…" : initial ? "Save target" : "Create target"}</Button>
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
        await saveTarget({...(initial?.revision ? {revision:initial.revision} : {}),guardrail_id:guardrailId.trim(),id:id.trim(), name:name.trim(), kind:"GUARDRAIL", provider, version:(initial?.version ?? 0)+1, definition:definition.trim()});
        onCreated();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        submitting.current = false; setBusy(false);
      }
    }}>
      <Field label="Target name *"><Input autoFocus required maxLength={200} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="e.g. Conversation safety" /></Field>
      <Field label="Configuration ID *" hint="Unique ID for this evaluation configuration. Multiple configurations can share the same Guardrail ID.">
        {initial ? <p className="rounded-md bg-muted/40 px-3 py-2 font-mono text-xs">{id}</p> : <Input required maxLength={128} value={id} disabled={busy} onChange={e=>setId(e.target.value)} placeholder="e.g. guardrail-conversation-safety" />}
      </Field>
      <Field label="Target ID (Guardrail) *" hint="The actual Guardrail connection ID, e.g. mock-guardrail. It can be shared by multiple evaluation configurations."><Input required pattern="[A-Za-z0-9][A-Za-z0-9_.-]{0,127}" value={guardrailId} disabled={busy} onChange={e=>setGuardrailId(e.target.value)} /></Field>
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
