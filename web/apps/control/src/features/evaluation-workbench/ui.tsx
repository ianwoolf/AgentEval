import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EvaluationLayerPageFrame } from "../evaluation-layer/shared/evaluation-page-frame";
export { Button };
export { Input } from "@/components/ui/input";
export { Textarea } from "@/components/ui/textarea";
export {
  EvaluationTable as Table,
  EvaluationMetric as Metric,
  EvaluationSection as Section,
  JsonPreview,
} from "../evaluation-layer/shared/evaluation-ui";
export function Frame({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <EvaluationLayerPageFrame
      title={title}
      description={description}
      action={action}
    >
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-muted-foreground">
        <FlaskConical className="size-4 shrink-0 text-amber-600" />
        <span>
          <strong className="text-foreground">Configuration preview</strong> ·
          Resource edits are session-only. Trigger submits real backend jobs; live reports are labeled separately. Existing demo reports remain simulated.
        </span>
      </div>
      {children}
    </EvaluationLayerPageFrame>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="grid gap-2 text-sm">
      <span id={id} className="font-medium">
        {label}
      </span>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              "aria-labelledby"?: string;
              "aria-describedby"?: string;
            }>,
            {
              "aria-labelledby": id,
              ...(hint ? { "aria-describedby": `${id}-hint` } : {}),
            },
          )
        : children}
      {hint && (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 min-w-0 rounded-md border bg-background px-3 text-sm ${props.className ?? ""}`}
    />
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  ) : null;
}
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tone === "good" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : tone === "bad" ? "border-red-500/25 bg-red-500/10 text-red-600" : "border-border bg-muted/50 text-muted-foreground"}`}
    >
      {children}
    </span>
  );
}
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={`sm:w-[min(calc(100%-2rem),60rem)] ${footer ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto p-6">{children}</div>
        {footer && <div className="shrink-0 space-y-3 border-t bg-background px-6 py-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
export function Tabs({
  items,
  active,
  onChange,
}: {
  items: string[];
  active: string;
  onChange(value: string): void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b pb-2">
      {items.map((item) => (
        <Button
          key={item}
          role="tab"
          aria-selected={active === item}
          variant={active === item ? "secondary" : "ghost"}
          onClick={() => onChange(item)}
        >
          {item}
        </Button>
      ))}
    </div>
  );
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function textValue(value: unknown) {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "—");
}
