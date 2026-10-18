import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BellRing, ChevronRight, Waypoints } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentProjectId } from '@/hooks/use-project';
import type {
  EvaluationLayerEvaluator,
  EvaluationLayerSpan,
  EvaluationLayerTrace,
} from '../model';
import { useEvaluationLayerState } from '../mock-provider';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import {
  EvaluationMetric,
  EvaluationSection,
  JsonPreview,
  KeyValueGrid,
  formatCost,
} from '../shared/evaluation-ui';
import {
  judgeAverage,
  legacyJudge,
  legacyToolEvidence,
  observationCount,
  recommendations,
  spanLevel,
  spanObservationType,
  spanRows,
  toolEffectStatus,
  traceCost,
  traceLatency,
} from './trace-view-model';

const TRACE_ALERT_EMAIL = 'security-ops@tasklattice.local';

export function EvaluationTraceDetail({ traceId }: { traceId: string }) {
  const state = useEvaluationLayerState();
  const projectId = useCurrentProjectId();
  const [alertSent, setAlertSent] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const trace = state.traces.find((item) => item.id === traceId);
  const rows = useMemo(() => (trace ? spanRows(trace) : []), [trace]);
  const selectedSpan =
    rows.find((row) => row.span.id === selectedSpanId)?.span ?? rows[0]?.span;

  if (!trace) {
    return (
      <EmptyState
        icon={Waypoints}
        title='Trace not found'
        description='The selected Trace no longer exists.'
        action={
          <Button asChild variant='outline'>
            <Link to='/$projectId/evaluation/overview' params={{ projectId }}>
              Back to Dashboard
            </Link>
          </Button>
        }
      />
    );
  }

  const latency = traceLatency(trace);
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-mono text-xl font-semibold'>{trace.id}</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Case {trace.caseId} · Evaluation {trace.runId}
          </p>
          {alertSent ? (
            <p
              role='status'
              aria-live='polite'
              className='mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300'
            >
              Alert sent to {TRACE_ALERT_EMAIL}.
            </p>
          ) : null}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button onClick={() => setAlertSent(true)}>
            <BellRing className='size-4' />
            Send alert
          </Button>
          <Button asChild variant='outline'>
            <Link to='/$projectId/evaluation/overview' params={{ projectId }}>
              Close
            </Link>
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-4'>
        <EvaluationMetric
          label='Status'
          value={<EvaluationLayerStatusBadge status={trace.status} />}
        />
        <EvaluationMetric label='Observations' value={observationCount(trace)} />
        <EvaluationMetric
          label='Latency'
          value={latency === undefined ? '—' : `${latency.toFixed(1)} ms`}
        />
        <EvaluationMetric label='Cost' value={formatCost(traceCost(trace))} />
      </div>

      <EvaluationSection
        title='Evaluator scores'
        description='An evaluator scores a trace only while it is enabled. Disable one on the Dashboard and newly captured traces show "Not scored" here.'
      >
        <div className='grid gap-3 md:grid-cols-2'>
          {state.evaluators.map((evaluator) => (
            <EvaluatorScoreCard
              key={evaluator.id}
              evaluator={evaluator}
              trace={trace}
            />
          ))}
        </div>
      </EvaluationSection>

      <TraceAnalysis trace={trace} />

      <EvaluationSection
        title='Span tree'
        description='Parent-child timing and selectable raw Span evidence.'
      >
        {rows.length ? (
          <>
            <div className='grid grid-cols-[minmax(260px,4.2fr)_5.8fr_minmax(72px,1.2fr)] gap-3 border-b px-2 pb-2 text-xs font-medium text-muted-foreground'>
              <span>SPAN</span>
              <span>TIMELINE</span>
              <span>DURATION</span>
            </div>
            <div className='divide-y'>
              {rows.map((row) => (
                <div
                  key={row.span.id}
                  className='grid grid-cols-[minmax(260px,4.2fr)_5.8fr_minmax(72px,1.2fr)] items-center gap-3 py-2'
                >
                  <Button
                    variant={selectedSpan?.id === row.span.id ? 'secondary' : 'ghost'}
                    className='h-auto min-w-0 justify-start font-mono text-xs'
                    style={{ marginLeft: `${row.depth * 18}px` }}
                    onClick={() => setSelectedSpanId(row.span.id)}
                  >
                    <span className='shrink-0'>{row.depth ? (row.isLast ? '└─' : '├─') : ''}</span>
                    <span>{spanIcon(row.span)}</span>
                    <span className='truncate'>{row.span.name}</span>
                  </Button>
                  <div className='relative h-2 overflow-hidden rounded-full bg-muted'>
                    <span
                      className='absolute inset-y-0 rounded-full'
                      style={{
                        left: `${row.leftPercent}%`,
                        width: `${row.widthPercent}%`,
                        backgroundColor: spanColor(row.span),
                      }}
                    />
                  </div>
                  <span className='text-xs text-muted-foreground'>
                    {row.latencyMs === undefined ? 'Running' : `${row.latencyMs.toFixed(1)} ms`}
                  </span>
                </div>
              ))}
            </div>
            {selectedSpan ? <SpanDetail span={selectedSpan} /> : null}
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>
            Raw span data is not available for this trace.
          </p>
        )}
      </EvaluationSection>

      <EvaluationSection title='Response'>
        <pre className='overflow-auto rounded-md border bg-muted/35 p-4 font-mono text-sm whitespace-pre-wrap'>
          {trace.response || '(empty)'}
        </pre>
      </EvaluationSection>

      <EvaluationSection title='Tool observations'>
        {trace.toolEvidence.length ? (
          <div className='grid gap-3'>
            {trace.toolEvidence.map((item) => (
              <details key={item.id} className='group rounded-md border bg-card'>
                <summary className='cursor-pointer list-none px-4 py-3 font-medium marker:hidden'>
                  <span className='flex items-center justify-between gap-3'>
                    <span>{item.toolId} · {toolEffectStatus(item)}</span>
                    <ChevronRight className='size-4 transition-transform group-open:rotate-90' />
                  </span>
                </summary>
                <div className='border-t p-4'>
                  <JsonPreview value={legacyToolEvidence(item)} />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>No Tool observations recorded.</p>
        )}
      </EvaluationSection>

      <EvaluationSection title='Judge observation'>
        {trace.judge ? (
          <JsonPreview value={legacyJudge(trace)} />
        ) : (
          <p className='text-sm text-muted-foreground'>No Judge observation recorded.</p>
        )}
      </EvaluationSection>

      <EvaluationSection title='Deterministic scores'>
        <JsonPreview value={trace.deterministicScores} />
      </EvaluationSection>
    </div>
  );
}

function TraceAnalysis({ trace }: { trace: EvaluationLayerTrace }) {
  const suggestions = recommendations(trace);
  const average = judgeAverage(trace);
  return (
    <EvaluationSection
      title='Analysis'
      description='Evidence-backed recommendations from the selected Trace.'
    >
      <KeyValueGrid
        className='sm:grid-cols-4 lg:grid-cols-4'
        items={[
          ['Spans', trace.spans.length || '—'],
          ['Errors', trace.spans.filter((span) => spanLevel(span) === 'ERROR').length],
          ['Tool calls', trace.toolEvidence.length],
          ['Judge', average === undefined ? '—' : average.toFixed(2)],
        ]}
      />
      {Object.keys(trace.deterministicReasons).length ? (
        <div className='mt-5'>
          <h3 className='font-medium'>Deterministic findings</h3>
          <div className='mt-2 grid gap-2 text-sm text-muted-foreground'>
            {Object.entries(trace.deterministicReasons).map(([name, reason]) => (
              <p key={name}>{name}: {reason}</p>
            ))}
          </div>
        </div>
      ) : null}
      <div className='mt-5'>
        <h3 className='font-medium'>Recommended changes</h3>
        {suggestions.length ? (
          <div className='mt-3 grid gap-3'>
            {suggestions.map((item, index) => (
              <div
                key={`${item.target}-${item.title}`}
                className='rounded-md border border-amber-500/25 bg-amber-500/5 p-4'
              >
                <p className='font-medium'>{index + 1}. {item.title}</p>
                <p className='mt-2 text-sm text-muted-foreground'>
                  Evidence · {item.evidence}
                </p>
                <p className='mt-2 text-sm'>
                  Change <strong>{item.target}</strong>: {item.change}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className='mt-2 text-sm text-emerald-700'>
            No evidence-backed change is recommended for this trace.
          </p>
        )}
      </div>
    </EvaluationSection>
  );
}

function SpanDetail({ span }: { span: EvaluationLayerSpan }) {
  const type = spanObservationType(span);
  const level = spanLevel(span);
  return (
    <div className='mt-5 rounded-lg border bg-card p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='text-lg font-semibold'>{spanIcon(span)} {span.name}</h3>
          <p className='mt-1 text-xs font-medium text-muted-foreground'>
            {type.toUpperCase()} · {level}
          </p>
        </div>
        <EvaluationLayerStatusBadge status={span.status} />
      </div>
      {span.statusMessage || span.error ? (
        <p className='mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
          {span.statusMessage ?? span.error}
        </p>
      ) : null}
      <KeyValueGrid
        className='mt-4'
        items={[
          ['Span ID', span.id],
          ['Parent', span.parentSpanId ?? 'Root'],
          ['Model', span.model ?? '—'],
        ]}
      />
      <Tabs defaultValue='input' className='mt-4'>
        <TabsList>
          <TabsTrigger value='input'>Input</TabsTrigger>
          <TabsTrigger value='output'>Output</TabsTrigger>
          <TabsTrigger value='metadata'>Metadata</TabsTrigger>
        </TabsList>
        <TabsContent value='input'>
          <RecordedJson value={span.input} />
        </TabsContent>
        <TabsContent value='output'>
          <RecordedJson value={span.output} />
        </TabsContent>
        <TabsContent value='metadata'>
          <RecordedJson value={span.metadata} />
        </TabsContent>
      </Tabs>
      {hasRecordedValue(span.usageDetails) || hasRecordedValue(span.costDetails) ? (
        <div className='mt-4 grid gap-4 md:grid-cols-2'>
          <div>
            <p className='mb-2 text-sm font-medium'>Usage</p>
            <RecordedJson value={span.usageDetails} />
          </div>
          <div>
            <p className='mb-2 text-sm font-medium'>Cost</p>
            <RecordedJson value={span.costDetails} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecordedJson({ value }: { value: unknown }) {
  return hasRecordedValue(value) ? (
    <JsonPreview value={value} />
  ) : (
    <p className='rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground'>
      Not recorded
    </p>
  );
}

function hasRecordedValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function spanIcon(span: EvaluationLayerSpan) {
  return {
    agent: '🧠',
    generation: '✦',
    tool: '🔧',
    evaluator: '✓',
    span: '◇',
  }[spanObservationType(span)] ?? '◇';
}

function spanColor(span: EvaluationLayerSpan) {
  if (spanLevel(span) === 'ERROR') return '#b3261e';
  return {
    agent: '#176b55',
    generation: '#7c5cbf',
    tool: '#2878b5',
    evaluator: '#b7791f',
    span: '#6d8078',
  }[spanObservationType(span)] ?? '#6d8078';
}

function EvaluatorScoreCard({
  evaluator,
  trace,
}: {
  evaluator: EvaluationLayerEvaluator;
  trace: EvaluationLayerTrace;
}) {
  const isBuiltIn = evaluator.provider === 'BUILT_IN';
  const judge = trace.judge;
  const scored = isBuiltIn
    ? Object.keys(trace.deterministicScores).length > 0
    : Boolean(judge);
  return (
    <div className='rounded-md border p-4'>
      <div className='flex items-center justify-between gap-2'>
        <p className='font-medium'>{evaluator.name}</p>
        <span className='text-xs text-muted-foreground'>
          {isBuiltIn ? 'Built-in' : 'Langfuse'} · v{evaluator.version}
        </span>
      </div>
      {!scored ? (
        <p className='mt-3 text-sm text-muted-foreground'>
          Not scored — this evaluator was disabled when the trace was captured.
        </p>
      ) : isBuiltIn ? (
        <ul className='mt-3 space-y-1.5'>
          {Object.entries(trace.deterministicScores).map(([name, score]) => (
            <li key={name} className='flex items-center justify-between gap-2 text-sm'>
              <span className='font-mono text-xs'>{name}</span>
              <span
                className={
                  score >= 1
                    ? 'text-xs font-medium text-emerald-600 dark:text-emerald-400'
                    : 'text-xs font-medium text-destructive'
                }
              >
                {score >= 1 ? '✓ 1/1' : '✗ 0/1'}
              </span>
            </li>
          ))}
          {Object.entries(trace.deterministicReasons).map(([name, reason]) => (
            <li key={name} className='text-xs text-muted-foreground'>
              {reason}
            </li>
          ))}
        </ul>
      ) : (
        <div className='mt-3 space-y-1.5'>
          {Object.entries(judge!.scores).map(([name, score]) => (
            <div key={name} className='flex items-center justify-between gap-2 text-sm'>
              <span className='font-mono text-xs'>{name}</span>
              <span
                className={
                  score >= 4
                    ? 'text-xs font-medium text-emerald-600 dark:text-emerald-400'
                    : 'text-xs font-medium text-destructive'
                }
              >
                {score}/5
              </span>
            </div>
          ))}
          <p className='pt-1 text-xs text-muted-foreground'>{judge!.summary}</p>
        </div>
      )}
    </div>
  );
}
