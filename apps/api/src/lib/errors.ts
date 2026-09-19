import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import type { Logger } from './logger';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: { path: string; message: string }[]) {
    return new AppError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Please start a new session.') {
    return new AppError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You don’t have access to this.') {
    return new AppError(403, 'forbidden', message);
  }
  static notFound(message = 'We couldn’t find that.') {
    return new AppError(404, 'not_found', message);
  }
  static unavailable(message = 'This service is temporarily unavailable. Please try again shortly.') {
    return new AppError(503, 'service_unavailable', message);
  }
}

export function zodDetails(error: z.ZodError) {
  return error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('This endpoint does not exist.'));
};

/** Maps any error to a safe JSON body. Stack traces are logged, never returned. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = req.requestId;
    if (res.headersSent) {
      logger.error({ err, requestId }, 'error after headers were sent');
      res.end();
      return;
    }
    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err, requestId }, err.message);
      res.status(err.status).json({ error: { code: err.code, message: err.message, requestId, details: err.details } });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'bad_request', message: 'Some fields are invalid.', requestId, details: zodDetails(err) } });
      return;
    }
    const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
    if (status === 413 || err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'payload_too_large', message: 'That recording is too long.', requestId } });
      return;
    }
    if (status === 400 && err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body.', requestId } });
      return;
    }
    logger.error({ err, requestId, path: req.path }, 'unhandled error');
    res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.', requestId } });
  };
}
