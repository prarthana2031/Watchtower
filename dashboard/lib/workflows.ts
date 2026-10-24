export type WorkflowKind = "automation" | "qa";

export type WorkflowStepAction =
  | "click"
  | "fill"
  | "assertVisible"
  | "assertText";

export type WorkflowStep = {
  id: string;
  action: WorkflowStepAction;
  selector: string;
  value: string;
};

export type Workflow = {
  id: string;
  name: string;
  url: string;
  kind: WorkflowKind;
  updatedAt: string;
  steps: WorkflowStep[];
  example?: boolean;
};

export type StepResult = {
  id: string;
  action: WorkflowStepAction;
  status: "passed" | "failed";
  durationMs: number;
  error?: string;
};

export type RunRecord = {
  id: string;
  workflowId: string;
  workflowName: string;
  kind: WorkflowKind;
  url: string;
  startedAt: string;
  status: "passed" | "failed";
  finalUrl: string;
  steps: StepResult[];
  error?: string;
};

export function isWorkflowStep(value: unknown): value is WorkflowStep {
  if (value === null || typeof value !== "object") return false;
  const step = value as Record<string, unknown>;
  return (
    typeof step.id === "string" &&
    (step.action === "click" ||
      step.action === "fill" ||
      step.action === "assertVisible" ||
      step.action === "assertText") &&
    typeof step.selector === "string" &&
    typeof step.value === "string"
  );
}

export function isWorkflow(value: unknown): value is Workflow {
  if (value === null || typeof value !== "object") return false;
  const workflow = value as Record<string, unknown>;
  return (
    typeof workflow.id === "string" &&
    typeof workflow.name === "string" &&
    typeof workflow.url === "string" &&
    (workflow.kind === "automation" || workflow.kind === "qa") &&
    typeof workflow.updatedAt === "string" &&
    (workflow.steps === undefined ||
      (Array.isArray(workflow.steps) && workflow.steps.every(isWorkflowStep))) &&
    (workflow.example === undefined || typeof workflow.example === "boolean")
  );
}

export function isRunRecord(value: unknown): value is RunRecord {
  if (value === null || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.id === "string" &&
    typeof run.workflowId === "string" &&
    typeof run.workflowName === "string" &&
    (run.kind === "automation" || run.kind === "qa") &&
    typeof run.url === "string" &&
    typeof run.startedAt === "string" &&
    (run.status === "passed" || run.status === "failed") &&
    typeof run.finalUrl === "string" &&
    Array.isArray(run.steps) &&
    run.steps.every(isStepResult) &&
    (run.error === undefined || typeof run.error === "string")
  );
}

function isStepResult(value: unknown): value is StepResult {
  if (value === null || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.id === "string" &&
    (result.action === "click" ||
      result.action === "fill" ||
      result.action === "assertVisible" ||
      result.action === "assertText") &&
    (result.status === "passed" || result.status === "failed") &&
    typeof result.durationMs === "number" &&
    (result.error === undefined || typeof result.error === "string")
  );
}
