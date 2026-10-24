import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Dataset, WorkbenchState } from "./contracts";
import { advanceEvaluation, createFixtures } from "./domain";
import { useCurrentProjectId } from "@/hooks/use-project";
import { executionApi, executionPages, fromRemote, type RemoteRun } from "./remote";
const initialState = () => ({ ...createFixtures(), datasets: [] });
const Context = createContext<{
  state: WorkbenchState;
  setState: Dispatch<SetStateAction<WorkbenchState>>;
  saveDataset(dataset: Dataset): Promise<Dataset>;
} | null>(null);
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkbenchState>(initialState);
  const projectId = useCurrentProjectId();
  const [syncError, setSyncError] = useState("");
  const [datasetError, setDatasetError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setState(initialState());
    setSyncError("");
    setDatasetError("");
    // Never substitute demo datasets when the backend is empty or unavailable.
    void executionPages<Dataset>(projectId, "datasets").then(datasets => {
      if (active) setState(s => ({ ...s, datasets }));
    }).catch(e => { if (active) setDatasetError((e as Error).message); });
    async function refresh() {
      try {
        const response = await executionApi<{items: RemoteRun[]}>(projectId, "runs");
        if (active) {
          setSyncError("");
          setState(s => ({ ...s, evaluations: [
            ...response.items.map(fromRemote).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            ...s.evaluations.filter(e => !e.remote),
          ] }));
        }
      } catch (e) { if (active) setSyncError((e as Error).message); }
      finally { if (active) timer = setTimeout(refresh, 3000); }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [projectId]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setState((current) =>
          current.evaluations.some((e) => e.status === "RUNNING")
            ? {
                ...current,
                evaluations: current.evaluations.map(e => e.remote ? e : advanceEvaluation(e)),
              }
            : current,
        ),
      900,
    );
    return () => clearInterval(timer);
  }, []);
  async function saveDataset(dataset: Dataset) {
    const saved = await executionApi<Dataset>(projectId, `datasets/${encodeURIComponent(dataset.id)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dataset),
    });
    setState(s => ({ ...s, datasets: s.datasets.some(d => d.id === saved.id)
      ? s.datasets.map(d => d.id === saved.id ? saved : d) : [...s.datasets, saved] }));
    return saved;
  }
  return <Context value={{ state, setState, saveDataset }}>{datasetError && <p role="alert" className="px-6 py-2 text-sm text-destructive">Dataset loading failed: {datasetError}. Reload to retry.</p>}{syncError && <p role="alert" className="px-6 py-2 text-sm text-destructive">Live evaluation sync: {syncError}. Retrying…</p>}{children}</Context>;
}
export function useWorkbench() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkbenchProvider is required.");
  return value;
}
