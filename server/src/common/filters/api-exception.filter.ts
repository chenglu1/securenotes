import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ExceptionBody = {
  message?: unknown;
  error?: unknown;
  details?: unknown;
  data?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : null;

    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: string[] | undefined;
    let data: unknown = null;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      const body = exceptionResponse as ExceptionBody;
      if (typeof body.message === 'string' && body.message.trim()) {
        message = body.message;
      } else if (Array.isArray(body.message)) {
        details = body.message.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        );
        if (details.length > 0) {
          message = details[0];
        }
      }

      if (typeof body.error === 'string' && body.error.trim()) {
        error = body.error;
      }

      if (Array.isArray(body.details)) {
        details = body.details.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        );
      }

      if (typeof body.data !== 'undefined') {
        data = body.data;
      }
    }

    if (!isHttpException && exception instanceof Error && exception.message.trim()) {
      message = exception.message;
    }

    response.status(statusCode).json({
      code: statusCode,
      message,
      error,
      details,
      data,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}