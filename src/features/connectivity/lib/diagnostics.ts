import type { MainControlCheck, MainDnsCheck, MainNetResult, MainTcpCheck, MainTlsCheck, MainTraceResult } from "@/platform/native";
import { API_BASE_URL } from "@/shared/api/baseUrl";

export type CheckStatus = "ok" | "fail" | "skip";

export interface DiagCheck {
  id: "device" | "api" | "dns" | "tcp" | "tls" | "control" | "trace" | "platform" | "main";
  host?: string;
  status: CheckStatus;
  detail?: string;
  latencyMs?: number;
}

export interface DiagnosticsResult {
  checks: DiagCheck[];
  main: MainNetResult | null;
}

export const DIAG_ENDPOINTS = { api: API_BASE_URL };

const CHECK_TIMEOUT_MS = 8000;
const MAX_ERROR_LENGTH = 120;
const HEALTH_URL = `${API_BASE_URL}/health`;
const NO_TRACEROUTE = "traceroute not installed";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^TypeError:\s*/i, "").slice(0, MAX_ERROR_LENGTH) || "failed";
}

function okOrFail(ok: boolean): CheckStatus {
  return ok ? "ok" : "fail";
}

async function checkApi(url: string): Promise<DiagCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { id: "api", status: okOrFail(response.ok), detail: `HTTP ${response.status}`, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { id: "api", status: "fail", detail: shortError(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Single cheap reachability check, used to notice when the connection comes back. */
export async function probeApi(): Promise<boolean> {
  return (await checkApi(HEALTH_URL)).status === "ok";
}

function failedWith(ok: boolean, error?: string): string | undefined {
  return !ok && error ? error : undefined;
}

function dnsCheck(check: MainDnsCheck): DiagCheck {
  const via = check.resolvers?.[0] ? `via ${check.resolvers[0]}` : undefined;
  const detail = check.addresses?.[0] ?? failedWith(check.ok, check.error) ?? via;
  return { id: "dns", host: check.host, status: okOrFail(check.ok), detail, latencyMs: check.ms };
}

function tcpCheck(check: MainTcpCheck): DiagCheck {
  return { id: "tcp", host: check.host, status: okOrFail(check.ok), detail: failedWith(check.ok, check.error), latencyMs: check.ms };
}

function tlsCheck(check: MainTlsCheck): DiagCheck {
  const certificate = [check.protocol, check.subject, check.authorized === false ? "untrusted" : null].filter(Boolean).join(" · ");
  const detail = check.protocol ? certificate : failedWith(check.ok, check.error);
  return { id: "tls", host: check.host, status: okOrFail(check.ok), detail, latencyMs: check.ms };
}

function controlCheck(check: MainControlCheck): DiagCheck {
  const detail = check.detail ?? (check.status ? `HTTP ${check.status}` : undefined) ?? check.error;
  return { id: "control", host: check.name, status: okOrFail(check.ok), detail, latencyMs: check.ms };
}

/** A missing traceroute binary is the machine's setup, not a network fault. */
function traceCheck(trace: MainTraceResult): DiagCheck {
  const status = trace.ok ? "ok" : trace.error === NO_TRACEROUTE ? "skip" : "fail";
  const detail = trace.hops.length > 0 ? `${trace.hops.length} hops` : (trace.error ?? "no hops");
  return { id: "trace", host: trace.host, status, detail, latencyMs: trace.ms };
}

function machineChecks(main: MainNetResult): DiagCheck[] {
  return [
    ...main.dns.map(dnsCheck),
    ...main.tcp.map(tcpCheck),
    ...main.tls.map(tlsCheck),
    ...main.controls.map(controlCheck),
    ...(main.trace ? [traceCheck(main.trace)] : []),
    { id: "platform", status: "skip", detail: main.platform },
  ];
}

async function diagnoseMachine(): Promise<DiagnosticsResult> {
  const diagnose = window.waveNative?.diagnoseNetwork;
  if (!diagnose) return { checks: [{ id: "main", status: "skip", detail: "desktop bridge unavailable" }], main: null };
  try {
    const main = await diagnose([hostOf(API_BASE_URL)]);
    return { checks: machineChecks(main), main };
  } catch (error) {
    return { checks: [{ id: "main", status: "fail", detail: shortError(error) }], main: null };
  }
}

/**
 * Runs every probe: the OS online flag, the API over HTTP, then DNS, TCP, TLS and traceroute from the
 * machine itself. Never throws; a probe that cannot run is reported as failed or skipped with a reason.
 */
export async function runAllChecks(): Promise<DiagnosticsResult> {
  const device: DiagCheck = navigator.onLine
    ? { id: "device", status: "ok", detail: "online" }
    : { id: "device", status: "fail", detail: "os reports offline" };
  const api = await checkApi(HEALTH_URL);
  const machine = await diagnoseMachine();
  return { checks: [device, api, ...machine.checks], main: machine.main };
}
