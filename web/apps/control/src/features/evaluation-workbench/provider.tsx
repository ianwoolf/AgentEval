import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { WorkbenchState } from "./contracts";
import { advanceEvaluation, createFixtures } from "./domain";
import { useCurrentProjectId } from "@/hooks/use-project";
import { executionApi, fromRemote, type RemoteRun } from "./remote";
const Context = createContext<{
  state: WorkbenchState;
  setState: Dispatch<SetStateAction<WorkbenchState>>;
} | null>(null);
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createFixtures);
  const projectId = useCurrentProjectId();
  const [syncError, setSyncError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setState(createFixtures());
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
  return <Context value={{ state, setState }}>{syncError && <p role="alert" className="px-6 py-2 text-sm text-destructive">Live evaluation sync: {syncError}. Retrying…</p>}{children}</Context>;
}
export function useWorkbench() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkbenchProvider is required.");
  return value;
}
