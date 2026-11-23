/**
 * Paginated list response from the API server.
 */
export interface PagedResponse<T> {
  content: T[];
  totalElements: number;
  number: number;
  size: number;
}

/**
 * Standard API success response
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Standard API error response format from backend.
 * All error responses follow this single format.
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
}

/**
 * Error response returned when X-Tenant-ID does not match.
 * HTTP 403 with this body indicates a tenant mismatch.
 */
export interface TenantMismatchErrorResponse {
  timestamp: number;
  message: string;
}
