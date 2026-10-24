// Runtime validation coverage for locally saved workflow and run records.
import { describe, expect, it } from "vitest";
import { isRunRecord, isWorkflow, isWorkflowStep } from "./workflows";

describe("workflow data validation", () => {
  it("accepts a saved workflow from the first dashboard stage without steps", () => {
    expect(
      isWorkflow({
        id: "workflow-1",
        name: "Homepage check",
        url: "https://example.com",
        kind: "qa",
        updatedAt: "Just now",
      }),
    ).toBe(true);
  });

  it("accepts supported browser actions and rejects arbitrary action names", () => {
    expect(
      isWorkflowStep({
        id: "step-1",
        action: "assertText",
        selector: "",
        value: "Example Domain",
      }),
    ).toBe(true);
    expect(
      isWorkflowStep({
        id: "step-2",
        action: "evaluate",
        selector: "",
        value: "alert(1)",
      }),
    ).toBe(false);
  });

  it("accepts completed run records with step evidence", () => {
    expect(
      isRunRecord({
        id: "run-1",
        workflowId: "workflow-1",
        workflowName: "Homepage check",
        kind: "qa",
        url: "https://example.com",
        startedAt: "2026-10-19T12:00:00.000Z",
        status: "passed",
        finalUrl: "https://example.com/",
        steps: [
          {
            id: "step-1",
            action: "assertText",
            status: "passed",
            durationMs: 12,
          },
        ],
      }),
    ).toBe(true);
  });
});
