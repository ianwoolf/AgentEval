import React, {useState} from 'react';
import {AdminViewContext} from '@/features/evaluation-workbench/view-mode';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, Link, redirect, useLocation } from '@tanstack/react-router';
import { WorkbenchProvider } from '@/features/evaluation-workbench/provider';
import { EvalPage } from '@/features/evaluation-workbench/eval-page';
import { DatasetsPage } from '@/features/evaluation-workbench/datasets-page';
import { EnvironmentsPage } from '@/features/evaluation-workbench/environments-page';
import { ScorersPage } from '@/features/evaluation-workbench/scorers-page';
import { ReportsPage } from '@/features/evaluation-workbench/reports-page';
import { evaluationRuntime } from '@/features/evaluation-workbench/runtime';
import '../styles.css';

const pages = [['catalog', 'Evaluation'], ['datasets', 'Datasets'], ['scorers', 'Scorers'], ['environments', 'Environments'], ['reports', 'Reports']] as const;
function Shell() {
  const projectId = evaluationRuntime().projectId;
  const [admin,setAdmin]=useState(false);
  const location=useLocation();
  return <AdminViewContext value={admin}><WorkbenchProvider><div className="min-h-screen bg-background text-foreground">
    <header className="border-b px-5 py-2"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6">
      <Link to="/$projectId/evaluation/catalog" params={{projectId}} className="text-xl font-semibold">AgentEval</Link>
      <nav aria-label="Evaluation navigation" className="flex flex-wrap gap-2">{pages.filter(([page])=>admin||page==='catalog'||page==='reports').map(([page,label]) =>
        <Link key={page} to={`/$projectId/evaluation/${page}`} params={{projectId}} className="rounded-md px-3 py-2 text-sm" activeProps={{className:'bg-primary/10 text-primary'}}>{label}</Link>)}</nav><button className="ml-auto rounded border px-3 py-1.5 text-sm" onClick={()=>{setAdmin(!admin);router.navigate({to:'/$projectId/evaluation/catalog',params:{projectId}});}}>{admin?'Switch to operator':'Manage workspace'}</button>
    </div></header><main id="main-content" className="mx-auto max-w-7xl p-4">{admin||!['datasets','scorers','environments'].some(page=>location.pathname.endsWith('/'+page))?<Outlet/>:<EvalPage/>}</main>
  </div></WorkbenchProvider></AdminViewContext>;
}
const root = createRootRoute({component: Shell, notFoundComponent: () => <p>Page not found.</p>});
const home = createRoute({getParentRoute:()=>root,path:'/',beforeLoad:()=>{throw redirect({to:'/$projectId/evaluation/catalog',params:{projectId:evaluationRuntime().projectId}});}});
const catalog = createRoute({getParentRoute:()=>root,path:'$projectId/evaluation/catalog',component:EvalPage});
const datasets = createRoute({getParentRoute:()=>root,path:'$projectId/evaluation/datasets',component:DatasetsPage});
const environments = createRoute({getParentRoute:()=>root,path:'$projectId/evaluation/environments',component:EnvironmentsPage});
const scorers = createRoute({getParentRoute:()=>root,path:'$projectId/evaluation/scorers',component:ScorersPage});
const reports = createRoute({getParentRoute:()=>root,path:'$projectId/evaluation/reports',
  validateSearch:(search:Record<string,unknown>)=>({evaluationId:typeof search.evaluationId==='string'?search.evaluationId:''}),
  component:()=>{const {evaluationId}=reports.useSearch();return <ReportsPage evaluationId={evaluationId} onSelect={id=>router.history.push(`/${encodeURIComponent(evaluationRuntime().projectId)}/evaluation/reports?evaluationId=${encodeURIComponent(id)}`)}/>;}});
const router = createRouter({routeTree:root.addChildren([home,catalog,datasets,environments,scorers,reports])});

async function start() {
  const response = await fetch('/evaluation-config.json', {cache:'no-store'});
  if (!response.ok) throw new Error('Cannot load evaluation UI configuration.');
  const config = await response.json();
  if (typeof config.projectId !== 'string' || !config.projectId || typeof config.apiBase !== 'string' || !config.apiBase) throw new Error('Invalid evaluation UI configuration.');
  window.__EVALUATION_CONFIG__={standalone:true,projectId:config.projectId,apiBase:config.apiBase};
  createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);
}
start().catch(error=>{document.getElementById('root')!.textContent=(error as Error).message;});
