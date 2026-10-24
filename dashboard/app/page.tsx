"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  isRunRecord,
  isWorkflow,
  type RunRecord,
  type Workflow,
  type WorkflowKind,
  type WorkflowStep,
  type WorkflowStepAction,
} from "../lib/workflows";

type Section = "overview" | "workflows" | "qa" | "history";

const STORAGE_KEY = "watchtower.workflows.v1";
const RUNS_STORAGE_KEY = "watchtower.runs.v1";

const starterWorkflows: Workflow[] = [
  {
    id: "starter-invoice",
    name: "Download a monthly invoice",
    url: "https://example.com/billing",
    kind: "automation",
    updatedAt: "Starter idea",
    steps: [],
    example: true,
  },
  {
    id: "starter-report",
    name: "Collect a weekly status report",
    url: "https://example.com/reports",
    kind: "automation",
    updatedAt: "Starter idea",
    steps: [],
    example: true,
  },
  {
    id: "starter-homepage",
    name: "Homepage smoke check",
    url: "https://example.com",
    kind: "qa",
    updatedAt: "Starter check",
    steps: [],
    example: true,
  },
];

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "workflows", label: "Workflows", icon: "⌘" },
  { id: "qa", label: "QA testing", icon: "✓" },
  { id: "history", label: "Run history", icon: "◷" },
];

function sectionTitle(section: Section) {
  return {
    overview: "Your workspace",
    workflows: "Browser workflows",
    qa: "QA testing",
    history: "Run history",
  }[section];
}

export default function Home() {
  const [section, setSection] = useState<Section>("overview");
  const [workflows, setWorkflows] = useState<Workflow[]>(starterWorkflows);
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<WorkflowKind>("automation");
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUrl, setEditingUrl] = useState("");
  const [editingSteps, setEditingSteps] = useState<WorkflowStep[]>([]);
  const [stepAction, setStepAction] = useState<WorkflowStepAction>("assertVisible");
  const [query, setQuery] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [formError, setFormError] = useState("");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runnerEnabled, setRunnerEnabled] = useState(false);
  const [runnerHostCount, setRunnerHostCount] = useState(0);
  const [runnerMessage, setRunnerMessage] = useState("Checking runner configuration…");
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [latestScreenshot, setLatestScreenshot] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(isWorkflow)) {
          throw new Error("Saved workflow data has an invalid shape.");
        }
        setWorkflows(parsed.map((workflow) => ({ ...workflow, steps: workflow.steps ?? [] })));
      }
      const savedRuns = window.localStorage.getItem(RUNS_STORAGE_KEY);
      if (savedRuns) {
        const parsedRuns: unknown = JSON.parse(savedRuns);
        if (!Array.isArray(parsedRuns) || !parsedRuns.every(isRunRecord)) {
          throw new Error("Saved run history has an invalid shape.");
        }
        setRuns(parsedRuns);
      }
    } catch (error) {
      console.error("Could not load saved workflows from this browser.", error);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
    } catch (error) {
      console.error("Could not save workflows in this browser.", error);
    }
  }, [hasLoaded, workflows]);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs));
    } catch (error) {
      console.error("Could not save browser run history.", error);
    }
  }, [hasLoaded, runs]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs")
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || result === null || typeof result !== "object") {
          const message =
            result !== null && typeof result === "object" && "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "Could not check browser runner configuration.";
          throw new Error(message);
        }
        const status = result as { enabled?: unknown; configuredHostCount?: unknown };
        if (!cancelled) {
          setRunnerEnabled(status.enabled === true);
          setRunnerHostCount(
            typeof status.configuredHostCount === "number" ? status.configuredHostCount : 0,
          );
          setRunnerMessage(
            status.enabled === true
              ? "Runner ready · target hosts are allowlisted"
              : "Add WATCHTOWER_ALLOWED_BROWSER_HOSTS to enable runs",
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRunnerEnabled(false);
          setRunnerMessage(
            error instanceof Error ? error.message : "Could not check runner configuration.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const automations = useMemo(
    () => workflows.filter((workflow) => workflow.kind === "automation"),
    [workflows],
  );
  const qaChecks = useMemo(
    () => workflows.filter((workflow) => workflow.kind === "qa"),
    [workflows],
  );
  const visibleWorkflows = useMemo(() => {
    const source =
      section === "workflows"
        ? automations
        : section === "qa"
          ? qaChecks
          : workflows;
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? source.filter(
          (workflow) =>
            workflow.name.toLowerCase().includes(normalizedQuery) ||
            workflow.url.toLowerCase().includes(normalizedQuery),
        )
      : source;
  }, [automations, qaChecks, query, section, workflows]);

  function openCreate(kind: WorkflowKind) {
    setCreateKind(kind);
    setFormError("");
    setShowCreate(true);
  }

  function openEditor(workflow: Workflow) {
    setFormError("");
    setEditingWorkflow(workflow);
    setEditingName(workflow.name);
    setEditingUrl(workflow.url);
    setEditingSteps(workflow.steps ?? []);
  }

  function createWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();
    if (!name || !url) {
      setFormError("Add a name and starting page URL.");
      return;
    }

    const normalizedUrl = /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      setFormError("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    if (
      (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      setFormError("Use a credential-free HTTP or HTTPS URL.");
      return;
    }
    setWorkflows((current) => [
      { id: crypto.randomUUID(), name, url: normalizedUrl, kind: createKind, updatedAt: "Just now", steps: [] },
      ...current,
    ]);
    setShowCreate(false);
    setSection(createKind === "qa" ? "qa" : "workflows");
    setQuery("");
  }

  function deleteWorkflow(id: string) {
    setWorkflows((current) => current.filter((workflow) => workflow.id !== id));
  }

  function addStep() {
    setEditingSteps((current) => [
      ...current,
      { id: crypto.randomUUID(), action: stepAction, selector: "", value: "" },
    ]);
  }

  function saveWorkflowSteps(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWorkflow) return;
    const name = editingName.trim();
    if (!name) {
      setFormError("Add a workflow name.");
      return;
    }
    const normalizedUrl = /^[a-z][a-z\d+.-]*:/i.test(editingUrl.trim())
      ? editingUrl.trim()
      : `https://${editingUrl.trim()}`;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      setFormError("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    if (
      (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      setFormError("Use a credential-free HTTP or HTTPS URL.");
      return;
    }
    const invalidStep = editingSteps.find((step) => {
      if (
        (step.action === "click" ||
          step.action === "fill" ||
          step.action === "assertVisible") &&
        !step.selector.trim()
      ) {
        return true;
      }
      return (step.action === "fill" || step.action === "assertText") && !step.value.trim();
    });
    if (invalidStep) {
      setFormError("Complete the selector and value fields for each step.");
      return;
    }
    if (editingSteps.length > 12) {
      setFormError("A workflow can contain at most 12 steps.");
      return;
    }

    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === editingWorkflow.id
          ? {
              ...workflow,
              name,
              url: parsedUrl.href,
              steps: editingSteps,
              updatedAt: "Just now",
              example: false,
            }
          : workflow,
      ),
    );
    setEditingWorkflow(null);
    setFormError("");
  }

  async function runWorkflow(workflow: Workflow) {
    setRunningWorkflowId(workflow.id);
    setRunError("");
    setLatestScreenshot("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: {
            id: workflow.id,
            name: workflow.name,
            url: workflow.url,
            kind: workflow.kind,
          },
          steps: workflow.steps,
        }),
      });
      const result: unknown = await response.json();
      const responseRun =
        result !== null && typeof result === "object" && "run" in result
          ? result.run
          : undefined;
      if (
        !response.ok ||
        !isRunRecord(responseRun)
      ) {
        const message =
          result !== null &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The browser runner returned an invalid response.";
        throw new Error(message);
      }
      setRuns((current) => [responseRun, ...current].slice(0, 100));
      if (
        result !== null &&
        typeof result === "object" &&
        "screenshotDataUrl" in result &&
        typeof result.screenshotDataUrl === "string" &&
        result.screenshotDataUrl.startsWith("data:image/jpeg;base64,")
      ) {
        setLatestScreenshot(result.screenshotDataUrl);
      }
      setSection("history");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The browser run failed.");
    } finally {
      setRunningWorkflowId(null);
    }
  }

  const heading =
    section === "workflows"
      ? "Workflows"
      : section === "qa"
        ? "QA checks"
        : section === "history"
          ? "Run history"
          : "Your workspace";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setSection("overview")}>
          <span className="brand-mark">W</span>
          <span>watchtower<span className="brand-period">.</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">P</span>
          <span className="workspace-copy"><strong>Personal workspace</strong><small>Local playground</small></span>
          <span className="switcher-chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              className={`nav-item ${section === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => {
                setSection(item.id);
                setQuery("");
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "workflows" && automations.length > 0 && (
                <span className="nav-count">{automations.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-card">
            <span className="engine-dot" />
            <div><strong>Local-first mode</strong><small>Runs stay on this device</small></div>
          </div>
          <button className="profile-button">
            <span className="profile-avatar">PR</span>
            <span><strong>Personal</strong><small>Starter workspace</small></span>
            <span className="profile-menu">···</span>
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{sectionTitle(section)}</strong></div>
          <div className="topbar-actions">
            <span className={`stage-pill ${runnerEnabled ? "ready" : "not-ready"}`}><span /> {runnerEnabled ? `Runner ready · ${runnerHostCount} hosts` : "Stage 2 · Runner setup"}</span>
            <button className="help-button" aria-label="Help">?</button>
          </div>
        </header>

        <div className="page-content">
          {section !== "history" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{section === "overview" ? "YOUR BROWSER WORKSPACE" : "WORKSPACE LIBRARY"}</div>
                  <h1>{heading}{section === "overview" && <span className="wave">✳</span>}</h1>
                  <p>
                    {section === "overview"
                      ? "Automate the busywork. Keep every browser check in one place."
                      : section === "qa"
                        ? "Create reusable browser checks alongside your everyday workflows."
                        : "Capture repeatable browser tasks and organize them into reusable workflows."}
                  </p>
                </div>
                <div className="heading-actions">
                  {section !== "qa" && <button className="button button-secondary" onClick={() => openCreate("qa")}><span>＋</span> New QA check</button>}
                  {section !== "workflows" && <button className="button button-primary" onClick={() => openCreate("automation")}><span>＋</span> New workflow</button>}
                  {section === "workflows" && <button className="button button-primary" onClick={() => openCreate("automation")}><span>＋</span> New workflow</button>}
                  {section === "qa" && <button className="button button-primary" onClick={() => openCreate("qa")}><span>＋</span> New QA check</button>}
                </div>
              </div>

              {section === "overview" && (
                <>
                  <div className="stats-grid">
                    <StatCard label="WORKFLOWS" value={String(automations.length)} note="Ready to configure" icon="⌘" tone="lavender" />
                    <StatCard label="QA CHECKS" value={String(qaChecks.length)} note="Reusable test ideas" icon="✓" tone="mint" />
                    <StatCard label="RUNS THIS WEEK" value={String(runs.filter((run) => { const age = Date.now() - Date.parse(run.startedAt); return age >= 0 && age < 7 * 24 * 60 * 60 * 1000; }).length)} note="Workflow + QA runs" icon="↗" tone="peach" />
                    <StatCard label="TIME SAVED" value="—" note="Track after repeat runs" icon="◷" tone="blue" />
                  </div>
                  <div className="overview-grid">
                    <section className="panel starter-panel">
                      <div className="panel-heading">
                        <div><span className="section-kicker">GET STARTED</span><h2>Make your first flow</h2></div>
                        <span className="sparkle">✳</span>
                      </div>
                      <p className="panel-intro">Start with a repeatable task or a browser check. Your flows are saved locally in this browser.</p>
                      <div className="starter-options">
                        <button className="starter-option" onClick={() => openCreate("automation")}>
                          <span className="option-icon purple">⌘</span>
                          <span className="option-copy"><strong>Automate a task</strong><small>Build a reusable daily workflow</small></span>
                          <span className="option-arrow">↗</span>
                        </button>
                        <button className="starter-option" onClick={() => openCreate("qa")}>
                          <span className="option-icon green">✓</span>
                          <span className="option-copy"><strong>Add a QA check</strong><small>Keep a test idea close at hand</small></span>
                          <span className="option-arrow">↗</span>
                        </button>
                      </div>
                      <div className="stage-note"><span className="note-icon">i</span><span><strong>{runnerEnabled ? "Runner is ready" : "One-time setup"}</strong> — {runnerEnabled ? "Browser actions run in an isolated session and only contact your configured hosts." : runnerMessage}.</span></div>
                    </section>
                    <section className="panel activity-panel">
                      <div className="panel-heading compact">
                        <div><span className="section-kicker">RECENTLY ADDED</span><h2>Your flows</h2></div>
                        <button className="text-button" onClick={() => setSection("workflows")}>View all <span>→</span></button>
                      </div>
                      <div className="recent-list">
                        {workflows.slice(0, 4).map((workflow) => (
                          <WorkflowRow key={workflow.id} workflow={workflow} onDelete={() => deleteWorkflow(workflow.id)} />
                        ))}
                        {workflows.length === 0 && <EmptyState title="Nothing here yet" text="Create a workflow or QA check to get started." />}
                      </div>
                    </section>
                  </div>
                </>
              )}

              {(section === "workflows" || section === "qa") && (
                <section className="panel list-panel">
                  <div className="list-toolbar">
                    <div>
                      <span className="section-kicker">{section === "qa" ? "TEST LIBRARY" : "YOUR LIBRARY"}</span>
                      <h2>{section === "qa" ? "Checks and test ideas" : "Saved workflows"}</h2>
                    </div>
                    <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or URL" /></label>
                  </div>
                  {visibleWorkflows.length > 0 ? (
                    <div className="workflow-list">
                      {visibleWorkflows.map((workflow) => (
                        <WorkflowRow
                          key={workflow.id}
                          workflow={workflow}
                          expanded
                          runnerEnabled={runnerEnabled}
                          running={runningWorkflowId === workflow.id}
                          onEdit={() => openEditor(workflow)}
                          onRun={() => void runWorkflow(workflow)}
                          onDelete={() => deleteWorkflow(workflow.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title={query ? "No matches found" : "Your library is ready"} text={query ? "Try another name or URL." : "Create your first item and it will show up here."} />
                  )}
                  {!runnerEnabled && <div className="runner-notice"><span className="note-icon">i</span><span>{runnerMessage}. Add comma-separated exact hosts in the dashboard environment file, then restart the dashboard.</span></div>}
                  {runError && <p className="form-error run-error" role="alert">{runError}</p>}
                </section>
              )}
            </>
          ) : (
            <section className="history-page">
              <div className="page-heading">
                <div><div className="eyebrow">EXECUTION LOG</div><h1>Run history</h1><p>Review browser workflow and QA run results in one place.</p></div>
              </div>
              {runs.length === 0 ? (
                <section className="panel history-empty">
                  <div className="empty-illustration"><span>◷</span><i>✳</i></div>
                  <span className="section-kicker">NO RUNS YET</span>
                  <h2>Your run history will appear here</h2>
                  <p>Save a workflow or QA check, add browser steps, then run it to see screenshots and results here.</p>
                  <button className="button button-secondary" onClick={() => setSection("workflows")}>Browse workflows</button>
                </section>
              ) : (
                <>
                  {latestScreenshot && (
                    <section className="panel screenshot-panel">
                      <div className="panel-heading"><div><span className="section-kicker">LATEST EVIDENCE</span><h2>Browser screenshot</h2></div></div>
                      <img src={latestScreenshot} alt="Screenshot captured by the latest browser run" />
                      <p>Screenshot is held for this browser session; run details are saved locally.</p>
                    </section>
                  )}
                  <section className="panel history-list">
                    {runs.map((run) => (
                      <article className="history-run" key={run.id}>
                        <div className={`run-status ${run.status}`}><span>{run.status === "passed" ? "✓" : "!"}</span></div>
                        <div className="run-summary">
                          <div className="run-title"><strong>{run.workflowName}</strong><span className={`kind-badge ${run.kind === "qa" ? "qa" : "automation"}`}>{run.kind === "qa" ? "QA check" : "Automation"}</span></div>
                          <span className="row-url">{run.finalUrl || run.url}</span>
                          <span className="run-time">{new Date(run.startedAt).toLocaleString()} · {run.steps.filter((step) => step.status === "passed").length}/{run.steps.length} steps passed</span>
                          {run.error && <span className="run-detail-error">{run.error}</span>}
                        </div>
                        <span className={`run-result ${run.status}`}>{run.status === "passed" ? "Passed" : "Failed"}</span>
                      </article>
                    ))}
                  </section>
                </>
              )}
            </section>
          )}
          <footer className="page-footer"><span>WATCHTOWER <span className="brand-period">●</span> LOCAL WORKSPACE</span><span>Isolated Playwright runs · Exact-host allowlist · No saved sign-in sessions</span></footer>
        </div>
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <button className="modal-close" onClick={() => setShowCreate(false)} aria-label="Close">×</button>
            <div className={`modal-icon ${createKind === "qa" ? "green" : "purple"}`}>{createKind === "qa" ? "✓" : "⌘"}</div>
            <span className="section-kicker">{createKind === "qa" ? "QA TEST LIBRARY" : "WORKFLOW LIBRARY"}</span>
            <h2 id="create-title">{createKind === "qa" ? "Create a QA check" : "Create a workflow"}</h2>
            <p className="modal-description">Save the goal and starting page. You can add browser steps when execution is introduced.</p>
            <form onSubmit={createWorkflow}>
              <label htmlFor="workflow-name">Name</label>
              <input id="workflow-name" name="name" placeholder={createKind === "qa" ? "e.g. Sign-in page smoke check" : "e.g. Export my weekly report"} required autoFocus onChange={() => setFormError("")} />
              <label htmlFor="workflow-url">Starting page URL</label>
              <input id="workflow-url" name="url" type="text" placeholder="https://example.com" required onChange={() => setFormError("")} />
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-footnote"><span>i</span>Saved only in this browser for now. Nothing will visit this URL yet.</div>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="button button-primary">Save as draft <span>→</span></button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editingWorkflow && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingWorkflow(null); }}>
          <section className="create-modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <button className="modal-close" onClick={() => setEditingWorkflow(null)} aria-label="Close">×</button>
            <div className={`modal-icon ${editingWorkflow.kind === "qa" ? "green" : "purple"}`}>{editingWorkflow.kind === "qa" ? "✓" : "⌘"}</div>
            <span className="section-kicker">PLAYWRIGHT WORKFLOW</span>
            <h2 id="edit-title">Configure browser steps</h2>
            <p className="modal-description">Runs start at this URL in a fresh browser session. Only the action types shown here are supported.</p>
            <form onSubmit={saveWorkflowSteps}>
              <label htmlFor="edit-name">Name</label>
              <input id="edit-name" value={editingName} onChange={(event) => { setEditingName(event.target.value); setFormError(""); }} maxLength={120} required />
              <label htmlFor="edit-url">Starting page URL</label>
              <input id="edit-url" value={editingUrl} onChange={(event) => { setEditingUrl(event.target.value); setFormError(""); }} required />
              <div className="step-editor-heading"><div><label>Steps <span>({editingSteps.length}/12)</span></label><small>Actions run in the order shown.</small></div></div>
              {editingSteps.length > 0 && (
                <div className="step-editor-list">
                  {editingSteps.map((step, index) => (
                    <div className="step-editor-card" key={step.id}>
                      <span className="step-number">{index + 1}</span>
                      <div className="step-fields">
                        <label htmlFor={`step-action-${step.id}`}>Action</label>
                        <select
                          id={`step-action-${step.id}`}
                          value={step.action}
                          onChange={(event) => {
                            const action = event.target.value as WorkflowStepAction;
                            setEditingSteps((current) => current.map((item) => item.id === step.id ? { ...item, action } : item));
                            setFormError("");
                          }}
                        >
                          <option value="click">Click element</option>
                          <option value="fill">Fill input</option>
                          <option value="assertVisible">Assert visible</option>
                          <option value="assertText">Assert text appears</option>
                        </select>
                        {step.action !== "assertText" && (
                          <>
                            <label htmlFor={`step-selector-${step.id}`}>CSS selector</label>
                            <input id={`step-selector-${step.id}`} value={step.selector} placeholder="e.g. button[type=submit]" onChange={(event) => { setEditingSteps((current) => current.map((item) => item.id === step.id ? { ...item, selector: event.target.value } : item)); setFormError(""); }} />
                          </>
                        )}
                        {(step.action === "fill" || step.action === "assertText") && (
                          <>
                            <label htmlFor={`step-value-${step.id}`}>{step.action === "fill" ? "Text to enter" : "Text to find"}</label>
                            <input id={`step-value-${step.id}`} value={step.value} placeholder={step.action === "fill" ? "Text entered into the field" : "Visible page text"} onChange={(event) => { setEditingSteps((current) => current.map((item) => item.id === step.id ? { ...item, value: event.target.value } : item)); setFormError(""); }} />
                          </>
                        )}
                      </div>
                      <button type="button" className="step-remove" aria-label={`Remove step ${index + 1}`} onClick={() => setEditingSteps((current) => current.filter((item) => item.id !== step.id))}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="add-step-row">
                <select aria-label="New step type" value={stepAction} onChange={(event) => setStepAction(event.target.value as WorkflowStepAction)}>
                  <option value="click">Click element</option>
                  <option value="fill">Fill input</option>
                  <option value="assertVisible">Assert visible</option>
                  <option value="assertText">Assert text appears</option>
                </select>
                <button type="button" className="button button-secondary" onClick={addStep} disabled={editingSteps.length >= 12}>＋ Add step</button>
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-footnote"><span>i</span>{runnerEnabled ? `Runs can reach ${runnerHostCount} explicitly allowed host(s).` : runnerMessage} Runs never reuse a saved login session.</div>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setEditingWorkflow(null)}>Cancel</button>
                <button type="submit" className="button button-primary">Save workflow <span>→</span></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: string; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></article>;
}

function WorkflowRow({
  workflow,
  expanded = false,
  runnerEnabled = false,
  running = false,
  onEdit,
  onRun,
  onDelete,
}: {
  workflow: Workflow;
  expanded?: boolean;
  runnerEnabled?: boolean;
  running?: boolean;
  onEdit?: () => void;
  onRun?: () => void;
  onDelete: () => void;
}) {
  const isQa = workflow.kind === "qa";
  return (
    <article className={`workflow-row ${expanded ? "expanded" : ""}`}>
      <span className={`row-icon ${isQa ? "green" : "purple"}`}>{isQa ? "✓" : "⌘"}</span>
      <div className="row-main"><div className="row-title"><strong>{workflow.name}</strong>{workflow.example && <span className="example-tag">EXAMPLE</span>}</div><span className="row-url">{workflow.url}</span></div>
      <span className={`kind-badge ${isQa ? "qa" : "automation"}`}>{isQa ? "QA check" : "Automation"}</span>
      <span className="row-date">{workflow.updatedAt}</span>
      <span className="draft-badge"><i /> Draft</span>
      {expanded && (
        <div className="row-actions">
          <button className="row-action" onClick={onEdit} disabled={!onEdit}>Edit steps</button>
          <button className="row-action run-action" onClick={onRun} disabled={!onRun || running || !runnerEnabled}>{running ? "Running…" : "Run"}</button>
          <button className="row-delete" onClick={onDelete} aria-label={`Delete ${workflow.name}`} title="Delete draft">×</button>
        </div>
      )}
    </article>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon">⌘</span><h3>{title}</h3><p>{text}</p></div>;
}