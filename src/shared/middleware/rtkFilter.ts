/**
 * RTK Filtering Middleware
 * 
 * This middleware applies RTK filtering to API responses to reduce token consumption
 * for AI clients that consume the API.
 */

import { NextResponse } from 'next/server';
import rtkService from '../services/rtkService.js';

export interface RtkMiddlewareOptions {
  enabled?: boolean;
  minResponseSize?: number; // Minimum response size in bytes to trigger filtering
  filterEndpoints?: string[] // Specific endpoints to filter
  excludeEndpoints?: string[] // Endpoints to exclude from filtering
}

const defaultOptions: RtkMiddlewareOptions = {
  enabled: true,
  minResponseSize: 1024, // 1KB
  filterEndpoints: [], // Empty means all endpoints
  excludeEndpoints: [
    '/api/health',
    '/api/status',
    '/api/metrics',
    '/api/logs',
  ], // Exclude health/check endpoints
};

/**
 * RTK filtering middleware factory
 */
export function createRtkMiddleware(options: RtkMiddlewareOptions = {}) {
  const config = { ...defaultOptions, ...options };

  return async (request: Request, response?: NextResponse) => {
    // Skip if RTK is not available or enabled
    if (!config.enabled || !rtkService.isRtkAvailable()) {
      return response;
    }

    // Skip if not a JSON response
    const contentType = response?.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return response;
    }

    // Check endpoint filtering rules
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check exclude list
    if (config.excludeEndpoints?.some(pattern => pathname.includes(pattern))) {
      return response;
    }

    // Check include list (if specified)
    if (config.filterEndpoints?.length > 0 && 
        !config.filterEndpoints.some(pattern => pathname.includes(pattern))) {
      return response;
    }

    // Process the response
    try {
      const responseText = await response?.text();
      
      // Skip if response is too small (use nullish coalescing to support 0 as a valid size)
      if (responseText && responseText.length < (config.minResponseSize ?? 1024)) {
        return response;
      }

      // Apply RTK filtering
      const filtered = await rtkService.filterOutput({
        command: 'api-response',
        args: [pathname],
        input: responseText,
      });

      if (filtered.success && filtered.filteredOutput) {
        // Create new response with filtered content
        const filteredResponse = new NextResponse(filtered.filteredOutput, {
          status: response?.status,
          statusText: response?.statusText,
          headers: response?.headers,
        });

        // Add RTK header to indicate filtering was applied
        filteredResponse.headers.set('X-RTK-Filtered', 'true');
        filteredResponse.headers.set('X-RTK-Token-Savings', 
          `${(1 - filtered.filteredOutput.length / responseText.length * 100).toFixed(1)}%`);

        return filteredResponse;
      }
    } catch (error) {
      console.warn('[RTK Middleware] Filtering failed, returning original response:', error);
    }

    return response;
  };
}

/**
 * Apply RTK filtering to a specific response string
 */
export async function applyRtkFilter(data: string, context?: string): Promise<string> {
  if (!rtkService.isRtkAvailable()) {
    return data;
  }

  try {
    const result = await rtkService.filterOutput({
      command: context || 'data-filter',
      input: data,
    });

    if (result.success) {
      return result.filteredOutput;
    }
  } catch (error) {
    console.warn('[RTK] Direct filtering failed:', error);
  }

  return data;
}

/**
 * RTK filter for specific data types
 */
export class RtkDataFilter {
  /**
   * Filter JSON responses
   */
  static async filterJson(data: any, context?: string): Promise<any> {
    if (!rtkService.isRtkAvailable()) {
      return data;
    }

    try {
      const jsonString = JSON.stringify(data, null, 2);
      const filteredString = await applyRtkFilter(jsonString, context || 'json-filter');
      
      if (filteredString !== jsonString) {
        return JSON.parse(filteredString);
      }
    } catch (error) {
      console.warn('[RTK] JSON filtering failed:', error);
    }

    return data;
  }

  /**
   * Filter error messages
   */
  static async filterError(error: Error | string): Promise<string> {
    if (!rtkService.isRtkAvailable()) {
      return typeof error === 'string' ? error : error.message;
    }

    try {
      const errorMessage = typeof error === 'string' ? error : error.message;
      const filtered = await applyRtkFilter(errorMessage, 'error-filter');
      return filtered;
    } catch (e) {
      return typeof error === 'string' ? error : error.message;
    }
  }

  /**
   * Filter log messages
   */
  static async filterLog(logMessage: string): Promise<string> {
    if (!rtkService.isRtkAvailable()) {
      return logMessage;
    }

    try {
      return await applyRtkFilter(logMessage, 'log-filter');
    } catch (error) {
      return logMessage;
    }
  }
}

/**
 * Hook to integrate RTK filtering into API routes
 */
export function withRtkFilter<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  options?: RtkMiddlewareOptions
) {
  return async (...args: T): Promise<NextResponse> => {
    const response = await handler(...args);
    const request = args[0] as Request;

    // Apply RTK middleware
    const middleware = createRtkMiddleware(options);
    return await middleware(request, response);
  };
}

export default createRtkMiddleware;