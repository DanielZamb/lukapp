import { z } from "zod";
import { ConvexError } from "convex/values";
import { feedbackError } from "./feedbackErrors";
import type { ReportPayload, ReportResult } from "./feedbackValues";

const issue = z.object({ number: z.number().int().positive(), html_url: z.string().url(), body: z.string().nullable().optional(), created_at: z.iso.datetime(), pull_request: z.unknown().optional(), user: z.object({ login: z.string().min(1) }) });

export class GithubRejectedCreate extends ConvexError<{ code: "not_configured" | "destination_unavailable" }> {}

export class GithubFeedback {
  private login?: string;

  constructor(private readonly repository: string) {}

  private async request(path: string, method = "GET", body?: unknown) {
    const token = process.env.GITHUB_FEEDBACK_TOKEN?.trim();
    if (!token) feedbackError({ code: "not_configured" });
    try {
      return await fetch(`https://api.github.com${path === "/user" ? path : `/repos/${this.repository}${path}`}`, {
        method, headers: {
          Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
          "User-Agent": "Lukapp-feedback",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(15_000),
      });
    } catch {
      feedbackError({ code: "destination_unavailable" });
    }
  }

  private check(response: Response) {
    if (response.ok) return;
    feedbackError({ code: this.failureCode(response) });
  }

  private failureCode(response: Response) {
    return response.status === 401 || response.status === 404 ? "not_configured" : "destination_unavailable";
  }

  private async parse<T>(response: Response, schema: z.ZodType<T>) {
    this.check(response);
    try { return schema.parse(await response.json()); }
    catch { feedbackError({ code: "destination_unavailable" }); }
  }

  private result(value: z.infer<typeof issue>): ReportResult {
    const url = `https://github.com/${this.repository}/issues/${value.number}`;
    if (value.html_url !== url) feedbackError({ code: "destination_unavailable" });
    return { reference: `#${value.number}`, issueNumber: value.number, url };
  }

  async find(marker: string, reservedAt: number): Promise<ReportResult | null> {
    const login: string = this.login ?? (await this.parse(await this.request("/user"), z.object({ login: z.string().min(1) }))).login;
    this.login = login;
    const earliest = Math.floor(reservedAt / 1000) * 1000;
    const since = new Date(earliest).toISOString();
    // GitHub's since filters updates. Sort and check creation time as well.
    for (let page = 1; page <= 100; page++) {
      const params = new URLSearchParams({ creator: login, state: "all", sort: "created", direction: "desc", since, per_page: "100", page: String(page) });
      const items = await this.parse(await this.request(`/issues?${params}`), z.array(issue));
      for (const item of items) {
        if (!item.pull_request && item.user.login === login && Date.parse(item.created_at) >= earliest && item.body?.includes(marker)) return this.result(item);
      }
      if (items.length < 100 || items.every((item) => Date.parse(item.created_at) < earliest)) return null;
    }
    feedbackError({ code: "destination_unavailable" });
  }

  async create(report: ReportPayload, body: string) {
    const response = await this.request("/issues", "POST", {
      title: `[${report.kind === "bug" ? "Bug" : "Feedback"}] ${safeTitle(report.title)}`,
      body, labels: ["needs-triage", report.kind],
    });
    if (!response.ok) throw new GithubRejectedCreate({ code: this.failureCode(response) });
    return this.result(await this.parse(response, issue));
  }
}

function escapeHtml(input: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "@": "&#64;", "#": "&#35;" };
  return input.replace(/[&<>@#]/g, (character) => entities[character]).replace(/\r\n?/g, "\n");
}

function safeTitle(input: string) {
  return input.replace(/@/g, "＠").replace(/#/g, "＃").replace(/[\u2028\u2029]/g, " ");
}

export function reportMarker(nonce: string) { return `<!-- lukapp-feedback:${nonce} -->`; }

export function issueBody(report: ReportPayload, nonce: string, screenshot?: { url: string; deleteAt: number }) {
  const section = (heading: string, value: string) => `## ${heading}\n\n<pre>${escapeHtml(value)}</pre>`;
  const context = report.context;
  const cell = (value: string) => escapeHtml(value).replace(/\|/g, "&#124;").replace(/[\n\t]/g, " ").replace(/[`*_~\\\[\]]/g, (c) => `&#${c.charCodeAt(0)};`);
  return [
    section("What happened", report.whatHappened),
    ...(report.expected ? [section("Expected", report.expected)] : []),
    ...(report.steps ? [section("Steps to reproduce", report.steps)] : []),
    ...(screenshot ? [`## Screenshot\n\n![Screenshot](${screenshot.url})\n\nThis screenshot will no longer be available after ${new Date(screenshot.deleteAt).toISOString()} (UTC).`] : []),
    `## Context\n\n| Field | Value |\n| --- | --- |\n| App version | ${cell(context.appVersion)} |\n| Platform | ${context.platform} |\n| OS version | ${cell(context.osVersion)} |\n| Language | ${context.language} |\n| Screen | ${cell(context.screen ?? "")} |`,
    reportMarker(nonce),
  ].join("\n\n");
}
