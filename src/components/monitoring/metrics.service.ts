import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { PrismaQueryMetric } from '../../prisma/prisma.service';

const LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];
const MAX_SAMPLES = 2048;

interface RouteMetrics {
  total: number;
  errors: number;
  durationSum: number;
  buckets: number[];
  responseBytes: number;
  samplesMs: number[];
}
interface ApiSnapshot {
  method: string;
  route: string;
  tenant: string;
  requests: number;
  errors: number;
  averageLatencyMs: number;
  responseBytes: number;
  bucketCounts: number[];
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}
interface QueryStats {
  tenant: string;
  signature: string;
  target: string;
  count: number;
  totalMs: number;
  maxMs: number;
  samplesMs: number[];
}
interface SlowQuery {
  at: string;
  tenant: string;
  signature: string;
  target: string;
  durationMs: number;
}

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly startedAt = performance.now();
  private readonly routes = new Map<string, RouteMetrics>();
  private readonly active = new Map<string, number>();
  private readonly queries = new Map<string, QueryStats>();
  private readonly slowQueries: SlowQuery[] = [];
  private readonly eventLoop = monitorEventLoopDelay({ resolution: 20 });
  private readonly slowQueryMs = this.positiveNumber(
    process.env.PROFILING_SLOW_QUERY_MS,
    500,
  );
  private previousCpu = process.cpuUsage();
  private previousCpuTime = performance.now();

  constructor() {
    this.eventLoop.enable();
  }

  normalizeTenant(value: string | string[] | undefined): string {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string' || !raw.trim()) return 'unknown';
    return raw.trim().toLowerCase().replace(/:\d+$/, '').slice(0, 100);
  }

  requestStarted(method: string, tenant: string) {
    const key = JSON.stringify([method, tenant]);
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
  }

  requestFinished(
    method: string,
    route: string,
    tenant: string,
    statusCode: number,
    durationSeconds: number,
    responseBytes: number,
  ) {
    const activeKey = JSON.stringify([method, tenant]);
    this.active.set(
      activeKey,
      Math.max(0, (this.active.get(activeKey) ?? 1) - 1),
    );
    const key = JSON.stringify([method, route, tenant, String(statusCode)]);
    const metric = this.routes.get(key) ?? {
      total: 0,
      errors: 0,
      durationSum: 0,
      buckets: LATENCY_BUCKETS.map(() => 0),
      responseBytes: 0,
      samplesMs: [],
    };
    metric.total++;
    metric.durationSum += durationSeconds;
    metric.responseBytes += responseBytes;
    this.addSample(metric.samplesMs, durationSeconds * 1000);
    if (statusCode >= 400) metric.errors++;
    LATENCY_BUCKETS.forEach((bucket, index) => {
      if (durationSeconds <= bucket) metric.buckets[index]++;
    });
    this.routes.set(key, metric);
  }

  recordPrismaQuery(tenant: string, event: PrismaQueryMetric) {
    const signature = this.querySignature(event.query);
    const key = JSON.stringify([tenant, event.target, signature]);
    const metric = this.queries.get(key) ?? {
      tenant,
      signature,
      target: event.target,
      count: 0,
      totalMs: 0,
      maxMs: 0,
      samplesMs: [],
    };
    metric.count++;
    metric.totalMs += event.duration;
    metric.maxMs = Math.max(metric.maxMs, event.duration);
    this.addSample(metric.samplesMs, event.duration);
    this.queries.set(key, metric);
    if (event.duration >= this.slowQueryMs) {
      this.slowQueries.unshift({
        at: new Date().toISOString(),
        tenant,
        signature,
        target: event.target,
        durationMs: event.duration,
      });
      if (this.slowQueries.length > 100) this.slowQueries.length = 100;
    }
  }

  render(): string {
    const memory = process.memoryUsage();
    const lines = [
      '# HELP payday_process_uptime_seconds Time since this process started.',
      '# TYPE payday_process_uptime_seconds gauge',
      `payday_process_uptime_seconds ${(performance.now() - this.startedAt) / 1000}`,
      '# HELP payday_process_cpu_user_seconds_total Total user CPU time.',
      '# TYPE payday_process_cpu_user_seconds_total counter',
      `payday_process_cpu_user_seconds_total ${process.cpuUsage().user / 1e6}`,
      '# HELP payday_process_cpu_system_seconds_total Total system CPU time.',
      '# TYPE payday_process_cpu_system_seconds_total counter',
      `payday_process_cpu_system_seconds_total ${process.cpuUsage().system / 1e6}`,
      '# HELP payday_process_resident_memory_bytes Resident memory size.',
      '# TYPE payday_process_resident_memory_bytes gauge',
      `payday_process_resident_memory_bytes ${memory.rss}`,
      '# HELP payday_nodejs_heap_used_bytes Used V8 heap memory.',
      '# TYPE payday_nodejs_heap_used_bytes gauge',
      `payday_nodejs_heap_used_bytes ${memory.heapUsed}`,
      '# HELP payday_nodejs_eventloop_lag_seconds Event-loop lag mean.',
      '# TYPE payday_nodejs_eventloop_lag_seconds gauge',
      `payday_nodejs_eventloop_lag_seconds ${this.nanosecondsToSeconds(this.eventLoop.mean)}`,
      '# HELP payday_nodejs_eventloop_lag_p99_seconds Event-loop lag p99.',
      '# TYPE payday_nodejs_eventloop_lag_p99_seconds gauge',
      `payday_nodejs_eventloop_lag_p99_seconds ${this.nanosecondsToSeconds(this.eventLoop.percentile(99))}`,
      '# HELP payday_http_requests_active Currently active API requests.',
      '# TYPE payday_http_requests_active gauge',
    ];
    for (const [key, count] of this.active) {
      const [method, tenant] = JSON.parse(key) as string[];
      lines.push(
        `payday_http_requests_active{method="${this.escape(method)}",tenant="${this.escape(tenant)}"} ${count}`,
      );
    }
    lines.push(
      '# HELP payday_http_requests_total Total completed API requests.',
      '# TYPE payday_http_requests_total counter',
      '# HELP payday_http_request_errors_total Total API responses with status >= 400.',
      '# TYPE payday_http_request_errors_total counter',
      '# HELP payday_http_response_bytes_total Total response bytes.',
      '# TYPE payday_http_response_bytes_total counter',
      '# HELP payday_http_request_duration_seconds API request duration.',
      '# TYPE payday_http_request_duration_seconds histogram',
    );
    for (const [key, metric] of this.routes) {
      const [method, route, tenant, status] = JSON.parse(key) as string[];
      const labels = `method="${this.escape(method)}",route="${this.escape(route)}",tenant="${this.escape(tenant)}",status="${status}"`;
      lines.push(
        `payday_http_requests_total{${labels}} ${metric.total}`,
        `payday_http_request_errors_total{${labels}} ${metric.errors}`,
        `payday_http_response_bytes_total{${labels}} ${metric.responseBytes}`,
      );
      LATENCY_BUCKETS.forEach((bucket, index) =>
        lines.push(
          `payday_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${metric.buckets[index]}`,
        ),
      );
      lines.push(
        `payday_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.total}`,
        `payday_http_request_duration_seconds_sum{${labels}} ${metric.durationSum}`,
        `payday_http_request_duration_seconds_count{${labels}} ${metric.total}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }

  snapshot() {
    const apis = new Map<string, ApiSnapshot>();
    for (const [key, metric] of this.routes) {
      const [method, route, tenant] = JSON.parse(key) as string[];
      const apiKey = JSON.stringify([method, route, tenant]);
      const current = apis.get(apiKey) ?? {
        method,
        route,
        tenant,
        requests: 0,
        errors: 0,
        averageLatencyMs: 0,
        responseBytes: 0,
        bucketCounts: LATENCY_BUCKETS.map(() => 0),
        samplesMs: [],
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
      };
      const previousSeconds =
        (current.averageLatencyMs / 1000) * current.requests;
      current.requests += metric.total;
      current.errors += metric.errors;
      current.responseBytes += metric.responseBytes;
      current.averageLatencyMs =
        ((previousSeconds + metric.durationSum) / current.requests) * 1000;
      metric.buckets.forEach(
        (count, index) => (current.bucketCounts[index] += count),
      );
      current.samplesMs.push(...metric.samplesMs);
      if (current.samplesMs.length > MAX_SAMPLES)
        current.samplesMs.splice(0, current.samplesMs.length - MAX_SAMPLES);
      apis.set(apiKey, current);
    }
    for (const api of apis.values()) {
      api.p50Ms = this.quantile(api.samplesMs, 0.5);
      api.p95Ms = this.quantile(api.samplesMs, 0.95);
      api.p99Ms = this.quantile(api.samplesMs, 0.99);
      api.samplesMs = [];
    }
    const memory = process.memoryUsage();
    const now = performance.now();
    const cpu = process.cpuUsage(this.previousCpu);
    const cpuPercent =
      ((cpu.user + cpu.system) /
        Math.max(1, (now - this.previousCpuTime) * 1000)) *
      100;
    this.previousCpu = process.cpuUsage();
    this.previousCpuTime = now;
    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: (performance.now() - this.startedAt) / 1000,
      system: {
        cpuPercent,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        eventLoopLagMs: this.nanosecondsToSeconds(this.eventLoop.mean) * 1000,
        eventLoopLagP99Ms:
          this.nanosecondsToSeconds(this.eventLoop.percentile(99)) * 1000,
        activeRequests: [...this.active.values()].reduce(
          (total, count) => total + count,
          0,
        ),
      },
      latencyBucketsMs: LATENCY_BUCKETS.map((bucket) => bucket * 1000),
      apis: [...apis.values()].sort((a, b) => b.requests - a.requests),
      queries: [...this.queries.values()]
        .map((query) => ({
          tenant: query.tenant,
          signature: query.signature,
          target: query.target,
          count: query.count,
          averageMs: query.totalMs / query.count,
          maxMs: query.maxMs,
          p50Ms: this.quantile(query.samplesMs, 0.5),
          p95Ms: this.quantile(query.samplesMs, 0.95),
          p99Ms: this.quantile(query.samplesMs, 0.99),
        }))
        .sort((a, b) => b.p95Ms - a.p95Ms),
      slowQueryThresholdMs: this.slowQueryMs,
      slowQueries: this.slowQueries,
    };
  }

  onModuleDestroy() {
    this.eventLoop.disable();
  }
  private addSample(samples: number[], value: number) {
    samples.push(value);
    if (samples.length > MAX_SAMPLES) samples.shift();
  }
  private quantile(values: number[], quantile: number) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(quantile * sorted.length) - 1] ?? 0;
  }
  private querySignature(query: string) {
    return query
      .replace(/'(?:''|[^'])*'/g, '?')
      .replace(/\b\d+(?:\.\d+)?\b/g, '?')
      .replace(/\$\d+|\?/g, '?')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }
  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
  private nanosecondsToSeconds(value: number) {
    return Number.isFinite(value) ? value / 1e9 : 0;
  }
  private escape(value: string) {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"');
  }
}
