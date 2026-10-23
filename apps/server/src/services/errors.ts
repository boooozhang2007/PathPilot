// 统一业务错误（PRD §9 错误格式 / §7.4 错误分类）
import { ERROR_MESSAGES, type ErrorCode } from '@pathpilot/shared';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message?: string,
    public readonly details?: unknown
  ) {
    super(message ?? ERROR_MESSAGES[code]);
  }
}

export const badRequest = (msg?: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', 400, msg, details);
export const unauthorized = (msg?: string) => new AppError('UNAUTHORIZED', 401, msg);
export const forbidden = (msg?: string) => new AppError('FORBIDDEN', 403, msg);
export const notFound = (msg?: string) => new AppError('NOT_FOUND', 404, msg);
export const conflict = (msg?: string) => new AppError('CONFLICT', 409, msg);
export const rateLimited = (msg?: string) => new AppError('RATE_LIMITED', 429, msg);
export const searchFailed = (msg?: string) => new AppError('SEARCH_FAILED', 502, msg);
export const modelCallFailed = (msg?: string) => new AppError('MODEL_CALL_FAILED', 502, msg);
export const outputInvalid = (msg?: string) => new AppError('AGENT_OUTPUT_INVALID', 502, msg);
export const budgetExceeded = (msg?: string) => new AppError('BUDGET_EXCEEDED', 422, msg);
export const sampleInsufficient = (msg?: string) => new AppError('SAMPLE_INSUFFICIENT', 422, msg);
export const internal = (msg?: string) => new AppError('INTERNAL_ERROR', 500, msg);
