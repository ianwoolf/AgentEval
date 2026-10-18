import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Database,
  FileText,
  Gauge,
  Bot,
  BrainCircuit,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  Eye,
  FileLock2,
  FileClock,
  Network,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@/components/auth/auth-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountMenu } from "@/components/account/account-menu";
import { BrandLogo } from "@/components/brand/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-project";
import {
  useEffectiveProjectRole,
  useProjectPermissions,
} from "@/hooks/use-project-permissions";
import { DemoRoleProvider, useDemoRole } from "@/hooks/use-demo-role";
import type { ProjectRole } from "@/types/project";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { applyPlatformPreferences } from "@/lib/platform-preferences";
import {
  getPersonalProfile,
  personalProfileQueryKey,
} from "@/services/personal-profile";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { CreateProjectSheet } from "@/components/project/create-project-sheet";
import { ProjectSwitcher } from "@/components/project/project-switcher";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { EvaluationMockProvider } from "@/features/evaluations/mock-provider";

type ProjectRoute =
  | "/$projectId/agent-garden"
  | "/$projectId/cost"
  | "/$projectId/traces"
  | "/$projectId/evaluations"
  | "/$projectId/evaluation/catalog"
  | "/$projectId/evaluation/environments"
  | "/$projectId/evaluation/scorers"
  | "/$projectId/evaluation/reports"
  | "/$projectId/evaluation/targets"
  | "/$projectId/evaluation/datasets"
  | "/$projectId/evaluation/runs"
  | "/$projectId/evaluation/overview"
  | "/$projectId/evaluation/traces"
  | "/$projectId/evaluation/settings"
  | "/$projectId/instances"
  | "/$projectId/requests/new"
  | "/$projectId/guardrails"
  | "/$projectId/access-policies"
  | "/$projectId/audit-logs"
  | "/$projectId/runtime-policies"
  | "/$projectId/knowledge-base"
  | "/$projectId/memory"
  | "/$projectId/mcp-servers"
  | "/$projectId/skills"
  | "/$projectId/requests";

type NavItemDefinition = {
  icon: LucideIcon;
  label: string;
  to: ProjectRoute;
  /**
   * Role whitelist: when set, only these project roles see the item.
   * Omit to show the item to every role. Keeps per-role navigation
   * extensible without changing the filter logic.
   */
  roles?: ProjectRole[];
};

/** Roles allowed to manage agents and run security evaluations. */
const AGENT_OPERATOR_ROLES: ProjectRole[] = ["admin", "member"];
/**
 * Agent Risk Assessment: Agent/Skill security evaluation + MCP tool misuse
 * detection (ADA, FRT, ISS per the role-requirement matrix).
 */
const SECURITY_EVAL_ROLES: ProjectRole[] = [...AGENT_OPERATOR_ROLES, "ada", "frt", "iss"];
/** Agent ID Management: agent identification/registry (FRT only). */
const AGENT_IDENTITY_ROLES: ProjectRole[] = [...AGENT_OPERATOR_ROLES, "frt"];
/** Agent Permission Management: policy compliance + permission control (FRT, Compliance). */
const POLICY_ROLES: ProjectRole[] = [...AGENT_OPERATOR_ROLES, "frt", "compliance"];
/** Guardrail management is admin-only. */
const GUARDRAIL_ADMIN_ROLES: ProjectRole[] = ["admin"];

export function navItemVisibleForRole(
  item: NavItemDefinition,
  role: ProjectRole,
): boolean {
  return !item.roles || item.roles.includes(role);
}

export const projectNavGroups: Array<{
  items: NavItemDefinition[];
  label: string;
}> = [
  {
    label: "Agentic",
    items: [
      { icon: Bot, label: "Agent Garden", to: "/$projectId/agent-garden", roles: AGENT_IDENTITY_ROLES },
      { icon: Boxes, label: "Instances", to: "/$projectId/instances", roles: AGENT_IDENTITY_ROLES },
      { icon: Sparkles, label: "Skills", to: "/$projectId/skills", roles: SECURITY_EVAL_ROLES },
      { icon: ServerCog, label: "MCP Servers", to: "/$projectId/mcp-servers", roles: SECURITY_EVAL_ROLES },
      { icon: Network, label: "Knowledge Base", to: "/$projectId/knowledge-base", roles: AGENT_IDENTITY_ROLES },
      { icon: BrainCircuit, label: "Memory", to: "/$projectId/memory", roles: AGENT_IDENTITY_ROLES },
    ],
  },
  {
    label: "Security",
    items: [
      {
        icon: ShieldAlert,
        label: "Guardrails",
        to: "/$projectId/guardrails",
        roles: GUARDRAIL_ADMIN_ROLES,
      },
      {
        icon: ShieldCheck,
        label: "Access Policies",
        to: "/$projectId/access-policies",
        roles: POLICY_ROLES,
      },
      { icon: FileLock2, label: "Runtime Policies", to: "/$projectId/runtime-policies", roles: POLICY_ROLES },
      { icon: FileClock, label: "Audit Logs", to: "/$projectId/audit-logs" },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { icon: CheckCircle2, label: "Eval", to: "/$projectId/evaluation/catalog", roles: SECURITY_EVAL_ROLES },
      { icon: Database, label: "Datasets", to: "/$projectId/evaluation/datasets", roles: SECURITY_EVAL_ROLES },
      { icon: Boxes, label: "Environments", to: "/$projectId/evaluation/environments", roles: SECURITY_EVAL_ROLES },
      { icon: Gauge, label: "Scorers", to: "/$projectId/evaluation/scorers", roles: SECURITY_EVAL_ROLES },
      { icon: FileText, label: "Reports", to: "/$projectId/evaluation/reports", roles: SECURITY_EVAL_ROLES },
    ],
  },
  {
    label: "Observer",
    items: [
      { icon: ChartNoAxesCombined, label: "Dashboard", to: "/$projectId/evaluation/overview" },
      { icon: Waypoints, label: "Traces", to: "/$projectId/traces" },
      { icon: CircleDollarSign, label: "Cost", to: "/$projectId/cost", roles: AGENT_OPERATOR_ROLES },
    ],
  },
];

export function itemIsActive(item: NavItemDefinition, pathname: string, projectId: string) {
  const target = item.to.replace("$projectId", encodeURIComponent(projectId));
  if (
    item.to === "/$projectId/instances" ||
    item.to === "/$projectId/access-policies" ||
    item.to === "/$projectId/evaluations" ||
    item.to.startsWith("/$projectId/evaluation/")
  )
    return pathname === target || pathname.startsWith(`${target}/`);
  return pathname === target;
}

function NavigationItem({ item, pathname, projectId }: {
  item: NavItemDefinition;
  pathname: string;
  projectId: string;
}) {
  const { setOpenMobile } = useSidebar();
  const active = itemIsActive(item, pathname, projectId);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link
          to={item.to}
          params={{ projectId }}
          onClick={() => setOpenMobile(false)}
          aria-current={active ? "page" : undefined}
          aria-label={item.label}
        >
          <item.icon className={cn(active && "text-primary")} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function DisabledNav({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-label={label}
        disabled
        tooltip={`${label} — not part of the current Agent operating path.`}
      >
        <Icon />
        <span>{label}</span>
        <span className="ml-auto bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide group-data-[collapsible=icon]:hidden">Later</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function DemoRoleSwitcher({ actualRole }: { actualRole: ProjectRole }) {
  const { roleOverride, setRoleOverride } = useDemoRole();
  return (
    <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
      <label className="grid gap-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Eye className="size-3.5" />
          Demo · View as role
        </span>
        <select
          aria-label="Demo role override"
          className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
          value={roleOverride ?? ""}
          onChange={(event) =>
            setRoleOverride(
              event.target.value === ""
                ? null
                : (event.target.value as ProjectRole),
            )
          }
        >
          <option value="">Actual ({actualRole})</option>
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="compliance">compliance</option>
          <option value="ada">ADA</option>
          <option value="frt">FRT</option>
          <option value="iss">ISS</option>
        </select>
      </label>
    </div>
  );
}

function ProjectSidebar({ logout, pathname, user }: {
  logout: () => void | Promise<void>;
  pathname: string;
  user: AuthUser | null;
}) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const {
    currentProject,
    refreshProjects,
    selectProject,
  } = useProject();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [toastProject, setToastProject] = useState("");
  const projectId = currentProject?.id ?? "individual";
  const role = useEffectiveProjectRole(currentProject?.role);
  const permissions = useProjectPermissions(currentProject?.role);
  const visibleGroups = projectNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          navItemVisibleForRole(item, role) &&
          (item.to !== "/$projectId/audit-logs" ||
            permissions.canViewAuditLogs),
      ),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <ToastProvider duration={3_000} swipeDirection="right">
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
          <Link to="/$projectId" params={{ projectId }} onClick={() => setOpenMobile(false)} className="flex min-h-11 min-w-0 items-center gap-3 px-2 focus-visible:outline-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label="TaskLattice home">
            <BrandLogo compact={!isMobile && state === "collapsed"} />
          </Link>
          <ProjectSwitcher
            collapsed={!isMobile && state === "collapsed"}
            onCreateProject={() => {
              setOpenMobile(false);
              setCreateProjectOpen(true);
            }}
            onProjectSwitchSuccess={(projectName) => {
              setOpenMobile(false);
              setToastProject(projectName);
            }}
          />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Project navigation" className="flex flex-col py-1">
            {visibleGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <Fragment key={item.to}>
                        <NavigationItem item={item} pathname={pathname} projectId={projectId} />
                      </Fragment>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <DemoRoleSwitcher actualRole={currentProject?.role ?? "member"} />
          <SidebarMenu>
            <DisabledNav icon={CircleHelp} label="Help & documentation" />
          </SidebarMenu>
          <div className="mt-1 border-t border-sidebar-border pt-2">
            <AccountMenu
              collapsed={!isMobile && state === "collapsed"}
              onLogout={logout}
              projectId={projectId}
              user={user}
            />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <CreateProjectSheet
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        user={user}
        onCreated={async (createdProjectId, projectName) => {
          await refreshProjects();
          await selectProject(createdProjectId);
          setToastProject(projectName);
        }}
      />

      <Toast
        open={Boolean(toastProject)}
        onOpenChange={(next) => {
          if (!next) setToastProject("");
        }}
        className="border-emerald-500/30 border-l-2"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-700">
            <CheckCircle2 className="size-4" />
          </span>
          <span>
            <ToastTitle>Project switched</ToastTitle>
            <ToastDescription>
              <strong className="block font-medium text-foreground">
                {toastProject}
              </strong>
              Resources updated
            </ToastDescription>
          </span>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}

export function AppShell() {
  const { logout, user } = useAuth();
  const account = useQuery({
    queryKey: personalProfileQueryKey,
    queryFn: getPersonalProfile,
    staleTime: 5 * 60_000,
  });
  const {
    currentProject,
    error: projectError,
    loading: projectLoading,
    refreshProjects,
  } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (account.data) {
      applyPlatformPreferences(account.data);
    }
  }, [account.data]);

  useEffect(() => {
    setSidebarOpen(window.localStorage.getItem("tasklattice.sidebar.collapsed") !== "true");
  }, []);

  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    window.localStorage.setItem("tasklattice.sidebar.collapsed", String(!open));
  };

  return (
    <DemoRoleProvider>
      <TooltipProvider delayDuration={250}>
        <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
        <ProjectSidebar
          logout={logout}
          pathname={pathname}
          user={user}
        />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/94 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <SidebarTrigger />
            <HeaderBreadcrumb pathname={pathname} />
            <button disabled className="ml-auto hidden h-9 w-64 cursor-not-allowed items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground/45 md:flex"><Search className="size-3.5" />Search project<span className="ml-auto text-[10px] uppercase">Later</span></button>
          </header>
          <main
            id="main-content"
            className={cn(
              "mx-auto w-full p-5 sm:p-6 lg:py-6",
              sidebarOpen ? "max-w-[1600px]" : "max-w-none",
            )}
          >
            {projectError ? (
              <div role="status" className="mb-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm text-amber-900">
                {projectError}
              </div>
            ) : null}
            {projectLoading ? (
              <div className="space-y-6" aria-label="Loading project data">
                <div className="h-20 animate-pulse rounded-md bg-muted/70" />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                  <div className="h-28 animate-pulse rounded-md bg-muted/60" />
                </div>
                <div className="h-64 animate-pulse rounded-md bg-muted/50" />
              </div>
            ) : !currentProject ? (
              <section className="mx-auto max-w-md py-20 text-center" aria-labelledby="no-project-title">
                <h1 id="no-project-title" className="text-lg font-semibold">
                  No project available
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create a Project before resources can be loaded.
                </p>
                <Button className="mt-5" onClick={() => void refreshProjects()}>
                  Reload projects
                </Button>
              </section>
            ) : (
              <EvaluationMockProvider
                key={currentProject.id}
                projectId={currentProject.id}
              >
                <Outlet />
              </EvaluationMockProvider>
            )}
          </main>
        </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </DemoRoleProvider>
  );
}
