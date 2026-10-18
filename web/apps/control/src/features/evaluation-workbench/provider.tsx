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
const Context = createContext<{
  state: WorkbenchState;
  setState: Dispatch<SetStateAction<WorkbenchState>>;
} | null>(null);
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createFixtures);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setState((current) =>
          current.evaluations.some((e) => e.status === "RUNNING")
            ? {
                ...current,
                evaluations: current.evaluations.map(advanceEvaluation),
              }
            : current,
        ),
      900,
    );
    return () => clearInterval(timer);
  }, []);
  return <Context value={{ state, setState }}>{children}</Context>;
}
export function useWorkbench() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkbenchProvider is required.");
  return value;
}
