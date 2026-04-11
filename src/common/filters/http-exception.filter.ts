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
  '/sw.js',
  '/service-worker.js',
  '/worker.js',
  '/favicon.ico',
  '/robots.txt',
]);

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

    const probe404 =
      status === HttpStatus.NOT_FOUND &&
      request.method === 'GET' &&
      BROWSER_PROBE_PATHS.has(request.path);

    if (probe404) {
      this.logger.debug(`${request.method} ${request.path} — ${status} (browser probe, no route)`);
    } else {
      this.logger.error(
        `${request.method} ${request.url} — ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'object' && 'message' in (message as object)
          ? (message as any).message
          : message,
    });
  }
}
