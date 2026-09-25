import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

// Connection-level failures: server unreachable, timed out, closed the
// connection, or the pool gave up waiting.
const CONNECTION_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

function isConnectionError(exception: unknown): boolean {
  if (exception instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  return (
    exception instanceof Prisma.PrismaClientKnownRequestError &&
    CONNECTION_ERROR_CODES.has(exception.code)
  );
}

// Turns "the database is down" into a 503 the frontend can explain, instead
// of a generic 500. Everything else goes through Nest's default handling.
@Catch()
export class DatabaseUnavailableFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(DatabaseUnavailableFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (!isConnectionError(exception)) {
      super.catch(exception, host);
      return;
    }

    this.logger.error(
      `Database unavailable: ${
        exception instanceof Error
          ? exception.message.split('\n').pop()
          : String(exception)
      }`,
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'The database is temporarily unavailable. Please try again shortly.',
        error: 'Service Unavailable',
      });
  }
}
