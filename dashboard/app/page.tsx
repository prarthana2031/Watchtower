"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type WorkflowKind = "automation" | "qa";
type Section = "overview" | "workflows" | "qa" | "history";

type Workflow = {
  id: string;
  name: string;
  url: string;
  kind: WorkflowKind;
  updatedAt: string;
  example?: boolean;
};

const STORAGE_KEY = "watchtower.workflows.v1";

const starterWorkflows: Workflow[] = [
  {
    id: "starter-invoice",
    name: "Download a monthly invoice",
    url: "https://example.com/billing",
    kind: "automation",
    updatedAt: "Starter idea",
    example: true,
  },
  {
    id: "starter-report",
    name: "Collect a weekly status report",
    url: "https://example.com/reports",
    kind: "automation",
    updatedAt: "Starter idea",
    example: true,
  },
  {
    id: "starter-homepage",
    name: "Homepage smoke check",
    url: "https://example.com",
    kind: "qa",
    updatedAt: "Starter check",
    example: true,
  },
];

function isWorkflow(value: unknown): value is Workflow {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    (candidate.kind === "automation" || candidate.kind === "qa") &&
    typeof candidate.updatedAt === "string" &&
    (candidate.example === undefined || typeof candidate.example === "boolean")
  );
}

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
  const [query, setQuery] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(isWorkflow)) {
          throw new Error("Saved workflow data has an invalid shape.");
        }
        setWorkflows(parsed);
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
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      setFormError("Only HTTP and HTTPS pages are supported.");
      return;
    }
    setWorkflows((current) => [
      {
        id: crypto.randomUUID(),
        name,
        url: normalizedUrl,
        kind: createKind,
        updatedAt: "Just now",
      },
      ...current,
    ]);
    setShowCreate(false);
    setSection(createKind === "qa" ? "qa" : "workflows");
    setQuery("");
  }

  function deleteWorkflow(id: string) {
    setWorkflows((current) => current.filter((workflow) => workflow.id !== id));
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
            <span className="stage-pill"><span /> Stage 1 · Workspace setup</span>
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
                    <StatCard label="RUNS THIS WEEK" value="—" note="Execution is coming next" icon="↗" tone="peach" />
                    <StatCard label="TIME SAVED" value="—" note="Available after first run" icon="◷" tone="blue" />
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
                      <div className="stage-note"><span className="note-icon">i</span><span><strong>Building in stages</strong> — workflows are drafts in this first stage. Browser execution and agent control arrive in a later stage.</span></div>
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
                      {visibleWorkflows.map((workflow) => <WorkflowRow key={workflow.id} workflow={workflow} expanded onDelete={() => deleteWorkflow(workflow.id)} />)}
                    </div>
                  ) : (
                    <EmptyState title={query ? "No matches found" : "Your library is ready"} text={query ? "Try another name or URL." : "Create your first item and it will show up here."} />
                  )}
                </section>
              )}
            </>
          ) : (
            <section className="history-page">
              <div className="page-heading">
                <div><div className="eyebrow">EXECUTION LOG</div><h1>Run history</h1><p>Review browser workflow and QA run results in one place.</p></div>
              </div>
              <section className="panel history-empty">
                <div className="empty-illustration"><span>◷</span><i>✳</i></div>
                <span className="section-kicker">NO RUNS YET</span>
                <h2>Your run history will appear here</h2>
                <p>Stage 1 lets you organize workflow and QA drafts. The browser runner will record real results in a later stage.</p>
                <button className="button button-secondary" onClick={() => setSection("overview")}>Back to overview</button>
              </section>
            </section>
          )}
          <footer className="page-footer"><span>WATCHTOWER <span className="brand-period">●</span> LOCAL WORKSPACE</span><span>Built for people and agents, one step at a time.</span></footer>
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
    </main>
  );
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: string; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></article>;
}

function WorkflowRow({
  workflow,
  expanded = false,
  onDelete,
}: {
  workflow: Workflow;
  expanded?: boolean;
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
      <button className="row-delete" onClick={onDelete} aria-label={`Delete ${workflow.name}`} title="Delete draft">×</button>
    </article>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon">⌘</span><h3>{title}</h3><p>{text}</p></div>;
}