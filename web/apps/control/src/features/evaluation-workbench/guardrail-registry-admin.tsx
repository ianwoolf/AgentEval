import { useEffect, useState } from "react";
import { Button, ErrorText, Field, Input, Modal, Select, Table } from "./ui";

type Instance = { id: string; name: string; address: string; enabled: boolean; verify_ssl: boolean };
type Provider = { id: string; name: string; instances: Instance[] };
type Registry = { version: number; providers: Provider[] };
type RegistryDocument = { revision: string; registry: Registry };
type AdminRequest = <T>(token: string, path: string, method?: string, body?: unknown) => Promise<T>;
type Editor =
  | { kind: "provider"; originalId?: string; id: string; name: string }
  | { kind: "instance"; providerId: string; originalId?: string; value: Instance };
const blankInstance = { id: "", name: "", address: "", enabled: true, verify_ssl: true };

export function GuardrailRegistryAdmin({ token, request }: { token: string; request: AdminRequest }) {
  const [document, setDocument] = useState<RegistryDocument | null>(null);
  const [providerId, setProviderId] = useState<string>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editError, setEditError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setNotice("");
    request<RegistryDocument>(token, "guardrail-registry").then(value => {
      if (active) {
        setDocument(value);
        setDirty(false);
      }
    }).catch(err => {
      if (active) setError((err as Error).message);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token, request, loadKey]);

  function replaceProviders(providers: Provider[]) {
    setDocument(current => current && ({...current, registry: {...current.registry, providers}}));
    setNotice("");
    setDirty(true);
  }

  async function save() {
    if (!document || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setDocument(await request<RegistryDocument>(token, "guardrail-registry", "PUT", document));
      setDirty(false);
      setNotice("Guardrail registry saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const providers = document?.registry.providers ?? [];
  const provider = providers.find(item => item.id === providerId) ?? providers[0];

  function openEditor(value: Editor) {
    setEditError("");
    setEditor(value);
  }

  function applyEditor() {
    if (!editor) return;
    if (editor.kind === "provider") {
      const id = editor.originalId ?? editor.id.trim();
      if (!editor.originalId && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) {
        setEditError("Enter a provider ID using letters, numbers, dots, underscores, or hyphens.");
        return;
      }
      if (!editor.originalId && providers.some(item => item.id === id)) {
        setEditError("This provider ID is already in use.");
        return;
      }
      if (!editor.name.trim()) {
        setEditError("Enter a provider name.");
        return;
      }
      const name = editor.name.trim();
      replaceProviders(editor.originalId
        ? providers.map(item => item.id === editor.originalId ? {...item, name} : item)
        : [...providers, {id, name, instances: []}]);
      setProviderId(id);
    } else {
      const value = {...editor.value, id: editor.value.id.trim(), address: editor.value.address.trim()};
      const owner = providers.find(item => item.id === editor.providerId);
      if (!owner) return;
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.id)) {
        setEditError("Enter a valid instance ID.");
        return;
      }
      if (owner.instances.some(item => item.id === value.id && item.id !== editor.originalId)) {
        setEditError("This instance ID is already in use for the selected provider.");
        return;
      }
      try {
        const url = new URL(value.address);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      } catch {
        setEditError("Enter an HTTP or HTTPS endpoint without credentials, a query, or a fragment.");
        return;
      }
      const instances = editor.originalId
        ? owner.instances.map(item => item.id === editor.originalId ? value : item)
        : [...owner.instances, value];
      replaceProviders(providers.map(item => item.id === owner.id ? {...owner, instances} : item));
    }
    setEditor(null);
  }

  function removeEdited() {
    if (!editor?.originalId) return;
    if (editor.kind === "provider") {
      replaceProviders(providers.filter(item => item.id !== editor.originalId));
    } else {
      replaceProviders(providers.map(item => item.id === editor.providerId
        ? {...item, instances: item.instances.filter(instance => instance.id !== editor.originalId)}
        : item));
    }
    setEditor(null);
  }

  return <section className="space-y-3" aria-label="Guardrail providers and instances">
    {document && <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Provider">
            <Select value={provider?.id ?? ""} disabled={busy || !providers.length}
              onChange={event => setProviderId(event.target.value)}>
              {!providers.length && <option value="">No providers</option>}
              {providers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
            </Select>
          </Field>
          {provider && <Button variant="outline" disabled={busy} onClick={() => openEditor({
            kind: "provider", originalId: provider.id, id: provider.id, name: provider.name,
          })}>Edit provider</Button>}
          <Button variant="outline" disabled={busy}
            onClick={() => openEditor({kind: "provider", id: "", name: ""})}>Add provider</Button>
        </div>
        {provider && <Button variant="outline" disabled={busy} onClick={() => openEditor({
          kind: "instance", providerId: provider.id, value: {...blankInstance},
        })}>Add instance</Button>}
      </div>

      {provider && <Table>
        <thead><tr><th>Instance</th><th>Scan endpoint</th><th>Status</th><th>TLS verification</th><th>Action</th></tr></thead>
        <tbody>{provider.instances.map(instance => <tr key={instance.id}>
          <td>{instance.name || instance.id}{instance.name && <div className="font-mono text-xs text-muted-foreground">{instance.id}</div>}</td>
          <td className="max-w-md break-all text-xs">{instance.address}</td>
          <td>{instance.enabled ? "Enabled" : "Disabled"}</td>
          <td>{instance.verify_ssl ? "On" : "Off"}</td>
          <td><Button variant="outline" size="sm" disabled={busy} aria-label={`Edit instance ${instance.id}`}
            onClick={() => openEditor({kind: "instance", providerId: provider.id, originalId: instance.id, value: {...instance}})}>Edit</Button></td>
        </tr>)}</tbody>
      </Table>}
      {provider && !provider.instances.length && <p className="text-sm text-muted-foreground">No instances for this provider.</p>}
    </>}
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={busy} onClick={() => setLoadKey(value => value + 1)}>Reload registry</Button>
      {document && <Button disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save registry"}</Button>}
      {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      {notice && <span role="status" className="text-sm">{notice}</span>}
    </div>
    <ErrorText message={error}/>

    {editor && <Modal title={`${editor.originalId ? "Edit" : "Add"} ${editor.kind}`}
      description="Apply changes here, then save the registry to use them in new evaluations."
      onClose={() => setEditor(null)}
      footer={<div className="flex flex-wrap justify-between gap-2">
        <div>{editor.originalId && <Button variant="outline" onClick={removeEdited}>Remove {editor.kind}</Button>}</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
          <Button type="submit" form="guardrail-registry-editor">Apply</Button>
        </div>
      </div>}>
      <form id="guardrail-registry-editor" className="space-y-3" onSubmit={event => {event.preventDefault(); applyEditor();}}>
        {editor.kind === "provider" ? <>
          <Field label="Provider ID" hint="Example: production-guard. The ID identifies this provider in evaluation settings.">
            <Input required value={editor.id} disabled={!!editor.originalId} maxLength={128}
              placeholder="production-guard" onChange={event => setEditor({...editor, id: event.target.value})}/>
          </Field>
          <Field label="Provider name"><Input required value={editor.name} onChange={event => setEditor({...editor, name: event.target.value})}/></Field>
        </> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instance ID"><Input required value={editor.value.id} onChange={event => setEditor({...editor, value: {...editor.value, id: event.target.value}})}/></Field>
            <Field label="Instance name"><Input value={editor.value.name} onChange={event => setEditor({...editor, value: {...editor.value, name: event.target.value}})}/></Field>
          </div>
          <Field label="Scan endpoint URL"><Input required type="url" value={editor.value.address}
            onChange={event => setEditor({...editor, value: {...editor.value, address: event.target.value}})}/></Field>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={editor.value.enabled}
              onChange={event => setEditor({...editor, value: {...editor.value, enabled: event.target.checked}})}/>Enabled</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editor.value.verify_ssl}
              onChange={event => setEditor({...editor, value: {...editor.value, verify_ssl: event.target.checked}})}/>Verify TLS certificate</label>
          </div>
        </>}
        <ErrorText message={editError}/>
      </form>
    </Modal>}
  </section>;
}
