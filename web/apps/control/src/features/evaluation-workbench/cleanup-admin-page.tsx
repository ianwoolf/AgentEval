import { useState, type FormEvent } from "react";
import { GuardrailRegistryAdmin } from "./guardrail-registry-admin";
import { evaluationRuntime } from "./runtime";
import { Button, ErrorText, Field, Input, Modal, Select, Table, Tabs } from "./ui";

type Job = { id: string; status: string; created_at?: string };
type Pod = Job & { job_id?: string; deletable: boolean };
type Report = Job & { name: string; job_id: string; job_present: boolean };
type Inventory = { jobs: Job[]; pods: Pod[]; reports: Report[]; total: number; jobs_supported: boolean };
type Selection = { kind: "pods" | "jobs" | "reports"; id: string };
type ReportFilters = { q: string; status: string; sort: string };
const defaultFilters: ReportFilters = {q: "", status: "", sort: "newest"};
const finished = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const displayTime = (value?: string) => value ? new Date(value).toLocaleString() : "—";

async function adminRequest<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const { apiBase, projectId } = evaluationRuntime();
  const response = await fetch(apiBase.replace(/\/$/, "") + "/admin/" + path, {
    method,
    cache: "no-store",
    headers: { Authorization: "Bearer " + token, "X-Project-ID": projectId, ...(body===undefined?{}:{"Content-Type":"application/json"}) },
    body: body===undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Management request failed.");
  return data;
}

export function CleanupAdminPage() {
  const [token, setToken] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [offset, setOffset] = useState(0);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Kubernetes");
  const [registryOpened, setRegistryOpened] = useState(false);
  const [notice, setNotice] = useState("");

  async function load(nextOffset: number, nextFilters = filters) {
    const params = new URLSearchParams({offset: String(nextOffset), sort: nextFilters.sort});
    if (nextFilters.q.trim()) params.set("q", nextFilters.q.trim());
    if (nextFilters.status) params.set("status", nextFilters.status);
    let result = await adminRequest<Inventory>(token, "cleanup?" + params);
    if (nextOffset && nextOffset >= result.total) {
      nextOffset = Math.max(0, Math.floor((result.total - 1) / 100) * 100);
      params.set("offset", String(nextOffset));
      result = await adminRequest<Inventory>(token, "cleanup?" + params);
    }
    setInventory(result);
    setOffset(nextOffset);
    setFilters(nextFilters);
  }

  async function refresh(nextOffset: number, nextFilters = filters) {
    setBusy(true);
    setError("");
    try {
      await load(nextOffset, nextFilters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest(token, selected.kind + "/" + encodeURIComponent(selected.id), "DELETE");
      setNotice(selected.kind === "reports" ? "Report, samples and traces deleted." : selected.kind === "pods" ? "Pod deletion requested." : "Job deletion requested.");
      setSelected(null);
      await load(offset);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refresh(0);
  }

  return <section className="space-y-5" aria-label="Evaluation management">
    <div>
      <h1 className="text-2xl font-semibold">Evaluation management</h1>
      <p className="text-sm text-muted-foreground">Manage Kubernetes workloads, stored reports, and Guardrail providers.</p>
    </div>
    {!inventory ? <form onSubmit={unlock} className="max-w-sm space-y-3">
      <Field label="Management token">
        <Input type="password" value={token} disabled={busy} autoComplete="off" onChange={e=>setToken(e.target.value)} />
      </Field>
      <Button type="submit" disabled={busy || !token}>Load inventory</Button>
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs items={["Kubernetes", "Guardrails"]} active={tab} onChange={value=>{
          setTab(value);
          if (value==="Guardrails") setRegistryOpened(true);
        }}/>
        <Button variant="ghost" disabled={busy} onClick={()=>{
          setInventory(null);setToken("");setNotice("");setError("");setTab("Kubernetes");setRegistryOpened(false);
        }}>Lock page</Button>
      </div>
      {registryOpened && <div role="tabpanel" aria-label="Guardrails" hidden={tab!=="Guardrails"}>
        <GuardrailRegistryAdmin token={token} request={adminRequest}/>
      </div>}
      <div role="tabpanel" aria-label="Kubernetes" hidden={tab!=="Kubernetes"} className="space-y-5">
      <Button variant="outline" disabled={busy} onClick={()=>void refresh(offset)}>Refresh</Button>
      {notice&&<p role="status" className="text-sm">{notice}</p>}
      <section className="space-y-2">
        <h2 className="font-semibold">Kubernetes Pods ({inventory.pods?.length ?? 0})</h2>
        <p className="text-xs text-muted-foreground">Shows evaluation Pods that currently exist in the cluster.</p>
        <Table><thead><tr><th>Pod</th><th>Phase</th><th>Owner Job</th><th>Action</th></tr></thead>
          <tbody>{inventory.pods?.map(pod=><tr key={pod.id}>
            <td className="font-mono text-xs">{pod.id}</td><td>{pod.status}</td><td className="font-mono text-xs">{pod.job_id??"—"}</td>
            <td>{pod.deletable
              ? <Button variant="outline" disabled={busy} onClick={()=>{setError("");setSelected({kind:"pods",id:pod.id});}}>Delete Pod</Button>
              : "—"}</td>
          </tr>)}</tbody>
        </Table>
        {!inventory.pods?.length&&<p className="text-sm text-muted-foreground">No evaluation Pods found.</p>}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Kubernetes Jobs ({inventory.jobs.length})</h2>
        <Table><thead><tr><th>Job ID</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>{inventory.jobs.map(job=><tr key={job.id}>
            <td className="font-mono text-xs">{job.id}</td><td>{job.status}</td><td>{displayTime(job.created_at)}</td>
            <td>{inventory.jobs_supported && finished.has(job.status)
              ? <Button variant="outline" disabled={busy} onClick={()=>{setError("");setSelected({kind:"jobs",id:job.id});}}>Delete Job</Button>
              : "—"}</td>
          </tr>)}</tbody>
        </Table>
        {!inventory.jobs.length&&<p className="text-sm text-muted-foreground">No Jobs found.</p>}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Stored reports</h2>
        <p className="text-xs text-muted-foreground">To delete a report, first remove its finished Job if it still exists.</p>
        <form className="grid items-end gap-3 sm:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto]" onSubmit={event=>{
          event.preventDefault();
          if (!busy) void refresh(0, draftFilters);
        }}>
          <Field label="Search reports">
            <Input type="search" value={draftFilters.q} maxLength={200} placeholder="Partial name, report ID or Job ID"
              disabled={busy} onChange={event=>setDraftFilters({...draftFilters,q:event.target.value})} />
          </Field>
          <Field label="Status">
            <Select value={draftFilters.status} disabled={busy} onChange={event=>setDraftFilters({...draftFilters,status:event.target.value})}>
              <option value="">All statuses</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </Field>
          <Field label="Sort by creation time">
            <Select value={draftFilters.sort} disabled={busy} onChange={event=>setDraftFilters({...draftFilters,sort:event.target.value})}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>Apply filters</Button>
        </form>
        <Table><thead><tr><th>Report</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>{inventory.reports.map(report=><tr key={report.id}>
            <td>{report.name}<div className="font-mono text-xs text-muted-foreground">{report.id}</div></td>
            <td>{report.status}</td><td>{displayTime(report.created_at)}</td>
            <td>{finished.has(report.status) && !report.job_present
              ? <Button variant="outline" disabled={busy} onClick={()=>{setError("");setSelected({kind:"reports",id:report.id});}}>Delete report</Button>
              : report.job_present ? "Job still exists" : "—"}</td>
          </tr>)}</tbody>
        </Table>
        {!inventory.reports.length&&<p className="text-sm text-muted-foreground">No reports match the current filters.</p>}
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" disabled={busy || offset===0} onClick={()=>void refresh(offset-100)}>Previous</Button>
          <span>{inventory.total} matching reports</span>
          <Button variant="outline" disabled={busy || offset+100>=inventory.total || offset>=9900} onClick={()=>void refresh(offset+100)}>Next</Button>
        </div>
      </section>
      </div>
    </>}
    {!selected&&<ErrorText message={error}/>}
    {selected&&<Modal title={selected.kind==="pods" ? "Delete finished Pod?" : selected.kind==="jobs" ? "Delete finished Job?" : "Permanently delete report?"}
      description={selected.kind==="pods" ? "Kubernetes will remove this Pod and its logs. Its Job and stored report remain available." : selected.kind==="jobs" ? "Kubernetes will remove the Job and its Pods. The stored report remains available."
        : "This permanently removes the report, its samples, scores and traces."}
      onClose={()=>{if(!busy)setSelected(null);}}
      footer={<div className="space-y-2"><ErrorText message={error}/><div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button>
        <Button disabled={busy} onClick={()=>void remove()}>{busy?"Deleting…":"Confirm deletion"}</Button>
      </div></div>}>
      <p className="break-all font-mono text-sm">{selected.id}</p>
    </Modal>}
  </section>;
}
