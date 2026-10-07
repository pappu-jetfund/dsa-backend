import { STATUS_CODES } from 'node:http';

export type HttpOutcome =
  | 'informational'
  | 'success'
  | 'redirection'
  | 'client_error'
  | 'server_error'
  | 'unknown';

export function classifyHttpStatus(statusCode: number): HttpOutcome {
  if (statusCode >= 100 && statusCode < 200) return 'informational';
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 300 && statusCode < 400) return 'redirection';
  if (statusCode >= 400 && statusCode < 500) return 'client_error';
  if (statusCode >= 500 && statusCode < 600) return 'server_error';
  return 'unknown';
}

export function defaultHttpReason(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Unknown HTTP status';
}
