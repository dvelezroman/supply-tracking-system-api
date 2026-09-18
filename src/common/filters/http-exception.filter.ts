import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Paths browsers often request on whatever host is open (e.g. API :3000) — not real API errors. */
const BROWSER_PROBE_PATHS = new Set([
  '/',
  '/sw.js',
  '/service-worker.js',
  '/worker.js',
  '/favicon.ico',
  '/robots.txt',
]);

/** This API is REST-only (`/api/v0/*`). tRPC clients hitting `/api/trpc/*` are misconfigured probes. */
const TRPC_PROBE_PREFIX = '/api/trpc';

function isNoRouteProbe404(
  status: number,
  method: string,
  path: string,
): boolean {
  if (status !== HttpStatus.NOT_FOUND || method !== 'GET') return false;
  if (BROWSER_PROBE_PATHS.has(path)) return true;
  return (
    path === TRPC_PROBE_PREFIX || path.startsWith(`${TRPC_PROBE_PREFIX}/`)
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const probe404 = isNoRouteProbe404(
      status,
      request.method,
      request.path,
    );

    if (probe404) {
      this.logger.debug(
        `${request.method} ${request.path} — ${status} (no route, ignored probe)`,
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url} — ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const responseBody =
      typeof message === 'object' && message !== null
        ? (message as Record<string, unknown>)
        : null;

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        responseBody && 'message' in responseBody
          ? responseBody.message
          : message,
      ...(responseBody && 'details' in responseBody
        ? { details: responseBody.details }
        : {}),
    });
  }
}
