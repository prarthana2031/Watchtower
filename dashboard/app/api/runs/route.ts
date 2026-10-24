import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { isBlockedBrowserAddress } from "../../../lib/browser-network";
import type {
  RunRecord,
  StepResult,
  WorkflowKind,
  WorkflowStep,
  WorkflowStepAction,
} from "../../../lib/workflows";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_STEPS = 12;
const NAVIGATION_TIMEOUT_MS = 12_000;
const ACTION_TIMEOUT_MS = 3_000;

type RunInput = {
  workflow: {
    id: string;
    name: string;
    url: string;
    kind: WorkflowKind;
  };
  steps: WorkflowStep[];
};

type AllowedHosts = {
  entries: Set<string>;
  resolverRules?: string;
  error?: string;
};

export async function GET() {
  const allowedHosts = readAllowedHosts();
  if (allowedHosts.error) {
    return NextResponse.json({ enabled: false, error: allowedHosts.error }, { status: 500 });
  }
  const pinnedHosts = await pinAllowedHosts(allowedHosts.entries);
  if (pinnedHosts.error) {
    return NextResponse.json({ enabled: false, error: pinnedHosts.error }, { status: 400 });
  }
  return NextResponse.json({
    enabled: allowedHosts.entries.size > 0,
    configuredHostCount: allowedHosts.entries.size,
  });
}

export async function POST(request: Request) {
  const allowedHosts = readAllowedHosts();
  if (allowedHosts.error) {
    return NextResponse.json({ error: allowedHosts.error }, { status: 500 });
  }
  if (allowedHosts.entries.size === 0) {
    return NextResponse.json(
      { error: "Browser runs are disabled. Configure WATCHTOWER_ALLOWED_BROWSER_HOSTS first." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "The run request is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read the run request." }, { status: 400 });
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "The run request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "The run request must contain valid JSON." }, { status: 400 });
  }

  const validationError = validateRunInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const input = body as RunInput;

  let startUrl: URL;
  try {
    startUrl = parseWebUrl(input.workflow.url);
  } catch {
    return NextResponse.json({ error: "The starting URL must be a valid HTTP or HTTPS URL." }, { status: 400 });
  }
  if (!isAllowedHost(startUrl, allowedHosts.entries)) {
    return NextResponse.json(
      { error: `The host "${startUrl.host}" is not in WATCHTOWER_ALLOWED_BROWSER_HOSTS.` },
      { status: 403 },
    );
  }
  const pinnedHosts = await pinAllowedHosts(allowedHosts.entries);
  if (pinnedHosts.error) {
    return NextResponse.json({ error: pinnedHosts.error }, { status: 400 });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: pinnedHosts.resolverRules
        ? [`--host-resolver-rules=${pinnedHosts.resolverRules}`]
        : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not start Chromium: ${errorMessage(error)}` },
      { status: 500 },
    );
  }

  const startedAt = new Date();
  const stepResults: StepResult[] = [];
  let status: RunRecord["status"] = "passed";
  let runError: string | undefined;
  let screenshotDataUrl: string | undefined;
  let finalUrl = startUrl.href;
  let blockedHost: string | undefined;

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      viewport: { width: 1280, height: 800 },
    });
    try {
      await context.route("**/*", async (route) => {
        const requestUrl = route.request().url();
        if (isNonNetworkBrowserUrl(requestUrl)) {
          await route.continue();
          return;
        }
        let parsedUrl: URL;
        try {
          parsedUrl = parseWebUrl(requestUrl);
        } catch {
          blockedHost = "non-HTTP URL";
          await route.abort("blockedbyclient");
          return;
        }
        if (!isAllowedHost(parsedUrl, allowedHosts.entries)) {
          blockedHost = parsedUrl.host;
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      await context.routeWebSocket("**/*", async (route) => {
        let socketUrl: URL;
        try {
          socketUrl = new URL(route.url());
        } catch {
          blockedHost = "invalid WebSocket URL";
          await route.close();
          return;
        }
        if (
          !["ws:", "wss:"].includes(socketUrl.protocol) ||
          !isAllowedHost(socketUrl, allowedHosts.entries)
        ) {
          blockedHost = socketUrl.host;
          await route.close();
          return;
        }
        route.connectToServer();
      });

      const page = await context.newPage();
      page.setDefaultTimeout(ACTION_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
      try {
        await page.goto(startUrl.href, { waitUntil: "domcontentloaded" });
        for (const step of input.steps) {
          const stepStarted = Date.now();
          try {
            await executeStep(page, step);
            stepResults.push({
              id: step.id,
              action: step.action,
              status: "passed",
              durationMs: Date.now() - stepStarted,
            });
          } catch (error) {
            status = "failed";
            const message = errorMessage(error);
            stepResults.push({
              id: step.id,
              action: step.action,
              status: "failed",
              durationMs: Date.now() - stepStarted,
              error: message,
            });
            runError = `Step ${stepResults.length} failed: ${message}`;
            break;
          }
        }
      } catch (error) {
        status = "failed";
        runError = errorMessage(error);
      }

      finalUrl = page.url();
      if (blockedHost) {
        status = "failed";
        runError = `A browser request to "${blockedHost}" was blocked. Add that exact host to WATCHTOWER_ALLOWED_BROWSER_HOSTS if you trust it.`;
      }
      try {
        const screenshot = await page.screenshot({
          type: "jpeg",
          quality: 65,
          fullPage: false,
          timeout: ACTION_TIMEOUT_MS,
        });
        screenshotDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
      } catch (error) {
        status = "failed";
        runError = `Could not capture the run screenshot: ${errorMessage(error)}`;
      }
    } finally {
      await context.close();
    }
  } catch (error) {
    status = "failed";
    runError = errorMessage(error);
  } finally {
    await browser.close();
  }

  const run: RunRecord = {
    id: randomUUID(),
    workflowId: input.workflow.id,
    workflowName: input.workflow.name,
    kind: input.workflow.kind,
    url: startUrl.href,
    startedAt: startedAt.toISOString(),
    status,
    finalUrl,
    steps: stepResults,
    ...(runError ? { error: runError } : {}),
  };

  return NextResponse.json({ run, screenshotDataUrl });
}

async function executeStep(
  page: import("playwright").Page,
  step: WorkflowStep,
): Promise<void> {
  switch (step.action) {
    case "click":
      await page.locator(step.selector).first().click();
      return;
    case "fill":
      await page.locator(step.selector).first().fill(step.value);
      return;
    case "assertVisible":
      await page.locator(step.selector).first().waitFor({ state: "visible" });
      return;
    case "assertText":
      await page.getByText(step.value, { exact: false }).first().waitFor({ state: "visible" });
      return;
  }
}

function validateRunInput(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return "The run request is invalid.";
  const input = value as Record<string, unknown>;
  if (input.workflow === null || typeof input.workflow !== "object") {
    return "A workflow is required.";
  }
  const workflow = input.workflow as Record<string, unknown>;
  if (
    typeof workflow.id !== "string" ||
    workflow.id.length > 100 ||
    typeof workflow.name !== "string" ||
    workflow.name.trim().length === 0 ||
    workflow.name.length > 120 ||
    typeof workflow.url !== "string" ||
    workflow.url.length > 2048 ||
    (workflow.kind !== "automation" && workflow.kind !== "qa")
  ) {
    return "The workflow name, ID, URL, or type is invalid.";
  }
  if (!Array.isArray(input.steps) || input.steps.length > MAX_STEPS) {
    return `A run can contain at most ${MAX_STEPS} steps.`;
  }
  for (let index = 0; index < input.steps.length; index += 1) {
    const step = input.steps[index];
    if (step === null || typeof step !== "object") return `Step ${index + 1} is invalid.`;
    const candidate = step as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      candidate.id.length > 100 ||
      !isWorkflowAction(candidate.action) ||
      typeof candidate.selector !== "string" ||
      candidate.selector.length > 500 ||
      typeof candidate.value !== "string" ||
      candidate.value.length > 2_000
    ) {
      return `Step ${index + 1} has invalid fields.`;
    }
    if (
      (candidate.action === "click" ||
        candidate.action === "fill" ||
        candidate.action === "assertVisible") &&
      candidate.selector.trim().length === 0
    ) {
      return `Step ${index + 1} needs a selector.`;
    }
    if (
      (candidate.action === "fill" || candidate.action === "assertText") &&
      candidate.value.trim().length === 0
    ) {
      return `Step ${index + 1} needs a value.`;
    }
  }
  return undefined;
}

function isWorkflowAction(value: unknown): value is WorkflowStepAction {
  return (
    value === "click" ||
    value === "fill" ||
    value === "assertVisible" ||
    value === "assertText"
  );
}

function readAllowedHosts(): AllowedHosts {
  const configured = process.env.WATCHTOWER_ALLOWED_BROWSER_HOSTS;
  if (!configured?.trim()) return { entries: new Set() };

  const entries = new Set<string>();
  for (const rawEntry of configured.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    try {
      const url = new URL(`http://${entry}`);
      if (
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        return {
          entries: new Set(),
          error: `Invalid host "${entry}" in WATCHTOWER_ALLOWED_BROWSER_HOSTS. Use comma-separated hostnames, optionally with a port.`,
        };
      }
      entries.add(url.host.toLowerCase());
    } catch {
      return {
        entries: new Set(),
        error: `Invalid host "${entry}" in WATCHTOWER_ALLOWED_BROWSER_HOSTS. Use comma-separated hostnames, optionally with a port.`,
      };
    }
  }
  return { entries };
}

async function pinAllowedHosts(hostEntries: Set<string>): Promise<AllowedHosts> {
  const resolverEntries: string[] = [];
  for (const hostEntry of Array.from(hostEntries)) {
    const url = new URL(`http://${hostEntry}`);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    const addressType = isIP(hostname);
    let addresses: string[];

    if (addressType !== 0) {
      addresses = [hostname];
    } else if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) {
      if (process.env.NODE_ENV === "production") {
        return {
          entries: new Set(),
          error: `Local host "${hostname}" is only allowed in development mode.`,
        };
      }
      addresses = ["127.0.0.1", "::1"];
    } else {
      try {
        addresses = Array.from(
          new Set(
            (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address),
          ),
        );
      } catch {
        return {
          entries: new Set(),
          error: `Could not resolve allowlisted host "${hostname}". Check your network and WATCHTOWER_ALLOWED_BROWSER_HOSTS.`,
        };
      }
    }

    if (
      addresses.length === 0 ||
      addresses.some(isBlockedBrowserAddress)
    ) {
      const localDevelopmentHost =
        process.env.NODE_ENV !== "production" &&
        (hostname === "localhost" ||
          hostname.endsWith(".localhost") ||
          hostname.endsWith(".local") ||
          addresses.every((address) => address === "127.0.0.1" || address === "::1"));
      if (!localDevelopmentHost) {
        return {
          entries: new Set(),
          error: `Allowlisted host "${hostname}" resolves to a local, private, reserved, or non-public address and cannot be run.`,
        };
      }
    }

    if (addressType === 0) {
      const pinnedAddress = addresses.find((address) => isIP(address) === 4) ?? addresses[0];
      const resolverAddress = isIP(pinnedAddress) === 6 ? `[${pinnedAddress}]` : pinnedAddress;
      resolverEntries.push(`MAP ${hostname} ${resolverAddress}`);
    }
  }

  return {
    entries: hostEntries,
    ...(resolverEntries.length > 0
      ? { resolverRules: resolverEntries.join(", ") }
      : {}),
  };
}

function parseWebUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error("Only credential-free HTTP and HTTPS URLs are supported.");
  }
  return url;
}

function isAllowedHost(url: URL, allowedHosts: Set<string>): boolean {
  return allowedHosts.has(url.host.toLowerCase());
}

function isNonNetworkBrowserUrl(value: string): boolean {
  return ["about:", "blob:", "data:"].some((protocol) => value.startsWith(protocol));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown browser error occurred.";
}
