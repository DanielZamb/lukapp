import { z } from "zod";
import { ConvexError } from "convex/values";
import { feedbackError } from "./feedbackErrors";
import { hash } from "./feedbackValues";
import type { ReportPayload, ReportResult } from "./feedbackValues";

const issue = z.object({ number: z.number().int().positive(), html_url: z.string().url(), body: z.string().nullable().optional(), created_at: z.iso.datetime(), pull_request: z.unknown().optional() });
const file = z.object({ sha: z.string(), size: z.number() });
const ref = z.object({ object: z.object({ sha: z.string() }) });
export const attachmentBranch = "feedback-attachments";

export class GithubRejectedCreate extends ConvexError<{ code: "not_configured" | "destination_unavailable" }> {}

export class GithubFeedback {
  constructor(private readonly repository: string) {}

  private async request(path: string, method = "GET", body?: unknown) {
    const token = process.env.GITHUB_FEEDBACK_TOKEN?.trim();
    if (!token) feedbackError({ code: "not_configured" });
    try {
      return await fetch(`https://api.github.com/repos/${this.repository}${path}`, {
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

  async find(marker: string, reservedAt: number) {
    const since = new Date(reservedAt - 60_000).toISOString();
    // GitHub's since filters updates. Sort and check creation time as well.
    for (let page = 1; page <= 100; page++) {
      const params = new URLSearchParams({ labels: "needs-triage", state: "all", sort: "created", direction: "desc", since, per_page: "100", page: String(page) });
      const items = await this.parse(await this.request(`/issues?${params}`), z.array(issue));
      for (const item of items) {
        if (!item.pull_request && item.body?.includes(marker)) return this.result(item);
      }
      if (items.length < 100 || items.every((item) => Date.parse(item.created_at) < reservedAt - 60_000)) return null;
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

  async screenshot(reportKey: string, blob: Blob) {
    if (blob.size > 5 * 1024 * 1024 || blob.size === 0)
      feedbackError({ code: "invalid_report", field: "screenshotStorageId" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const png = validPng(bytes);
    const jpeg = validJpeg(bytes);
    if (!((blob.type === "image/png" && png) || (blob.type === "image/jpeg" && jpeg)))
      feedbackError({ code: "invalid_report", field: "screenshotStorageId" });
    const ext = png ? "png" : "jpg";
    await this.ensureBranch();
    const path = `/contents/feedback/${reportKey}.${ext}`;
    const params = `?ref=${attachmentBranch}`;
    const existing = await this.request(`${path}${params}`);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const content = btoa(binary);
    const expectedSha = await gitBlobSha(bytes);
    if (existing.status === 404) {
      const uploaded = await this.request(path, "PUT", { message: `Feedback attachment ${reportKey}`, branch: attachmentBranch, content });
      if (uploaded.status === 409 || uploaded.status === 422) {
        const afterConflict = await this.request(`${path}${params}`);
        if (afterConflict.status === 404) feedbackError({ code: "destination_unavailable" });
        const reused = await this.parse(afterConflict, file);
        if (reused.sha !== expectedSha) feedbackError({ code: "changed_report" });
      } else {
        const saved = await this.parse(uploaded, z.object({ content: file }));
        if (saved.content.sha !== expectedSha) feedbackError({ code: "destination_unavailable" });
      }
    } else {
      const reused = await this.parse(existing, file);
      if (reused.sha !== expectedSha) feedbackError({ code: "changed_report" });
    }
    return `https://github.com/${this.repository}/blob/${attachmentBranch}/feedback/${reportKey}.${ext}?raw=true`;
  }

  private async ensureBranch() {
    const branch = await this.request(`/git/ref/heads/${attachmentBranch}`);
    if (branch.status !== 404) { await this.parse(branch, ref); return; }
    const repository = await this.parse(await this.request(""), z.object({ default_branch: z.string().min(1) }));
    const base = await this.parse(await this.request(`/git/ref/heads/${encodeURIComponent(repository.default_branch)}`), ref);
    const created = await this.request("/git/refs", "POST", { ref: `refs/heads/${attachmentBranch}`, sha: base.object.sha });
    if (created.status === 422) { await this.parse(await this.request(`/git/ref/heads/${attachmentBranch}`), ref); return; }
    await this.parse(created, ref);
  }
}

async function gitBlobSha(bytes: Uint8Array) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const input = new Uint8Array(header.length + bytes.length);
  input.set(header); input.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", input);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function validPng(bytes: Uint8Array) {
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let imageData = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset + length + 12 > bytes.length) return false;
    if (offset === 8 && (type !== "IHDR" || length !== 13 || view.getUint32(16) === 0 || view.getUint32(20) === 0)) return false;
    if (type === "IDAT" && length > 0) imageData = true;
    if (type === "IEND") return imageData && length === 0 && offset + 12 === bytes.length;
    offset += length + 12;
  }
  return false;
}

function validJpeg(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return false;
  let frame = false;
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 255) return false;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) return frame && offset + 2 < bytes.length - 2;
    if (marker === 217 || marker === 0 || marker === 216) return false;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8 || bytes[offset + 3] * 256 + bytes[offset + 4] === 0 || bytes[offset + 5] * 256 + bytes[offset + 6] === 0) return false;
      frame = true;
    }
    offset += length;
  }
  return false;
}

function escapeHtml(input: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "@": "&#64;", "#": "&#35;" };
  return input.replace(/[&<>@#]/g, (character) => entities[character]).replace(/\r\n?/g, "\n");
}

function safeTitle(input: string) {
  return input.replace(/@/g, "＠").replace(/#/g, "＃").replace(/[\u2028\u2029]/g, " ");
}

export async function reporterId(userId: string) { return (await hash(`lukapp-feedback-reporter:${userId}`)).slice(0, 24); }
export function reportMarker(reporter: string, reportKey: string) { return `<!-- lukapp-feedback:${reporter}:${reportKey} -->`; }

export function issueBody(report: ReportPayload, reporter: string, screenshotUrl?: string) {
  const section = (heading: string, value: string) => `## ${heading}\n\n<pre>${escapeHtml(value)}</pre>`;
  const context = report.context;
  const cell = (value: string) => escapeHtml(value).replace(/\|/g, "&#124;").replace(/[\n\t]/g, " ").replace(/[`*_~\\\[\]]/g, (c) => `&#${c.charCodeAt(0)};`);
  return [
    section("What happened", report.whatHappened),
    ...(report.expected ? [section("Expected", report.expected)] : []),
    ...(report.steps ? [section("Steps to reproduce", report.steps)] : []),
    ...(screenshotUrl ? [`## Screenshot\n\n![Screenshot](${screenshotUrl})`] : []),
    `## Context\n\n| Field | Value |\n| --- | --- |\n| App version | ${cell(context.appVersion)} |\n| Platform | ${context.platform} |\n| OS version | ${cell(context.osVersion)} |\n| Language | ${context.language} |\n| Screen | ${cell(context.screen ?? "")} |\n| Reporter | ${reporter} |`,
    reportMarker(reporter, report.reportKey),
  ].join("\n\n");
}
