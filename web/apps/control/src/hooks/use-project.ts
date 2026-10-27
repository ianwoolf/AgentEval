import { useContext } from "react";
import { ProjectContext } from "@/components/project/project-context";
import { evaluationRuntime } from '@/features/evaluation-workbench/runtime';

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used inside ProjectProvider.");
  }
  return context;
}

export function useCurrentProjectId() {
  const context = useContext(ProjectContext);
  const runtime = evaluationRuntime();
  if (runtime.standalone) return runtime.projectId;
  if (!context) throw new Error('useCurrentProjectId must be used inside ProjectProvider.');
  return context.currentProject?.id ?? 'individual';
}
