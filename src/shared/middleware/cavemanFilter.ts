/**
 * Caveman Compression Middleware
 *
 * This middleware handles the injection of Caveman rules into the request pipeline
 * or post-processes the AI response to ensure it follows the caveman style.
 */

import { NextResponse } from 'next/server';
import cavemanService, { CavemanMode } from '../services/cavemanService.js';

export interface CavemanMiddlewareOptions {
  enabled?: boolean;
  defaultMode?: CavemanMode;
  forceMode?: CavemanMode;
}

const defaultOptions: CavemanMiddlewareOptions = {
  enabled: true,
  defaultMode: 'full',
};

/**
 * Caveman filtering middleware factory
 */
export function createCavemanMiddleware(options: CavemanMiddlewareOptions = {}) {
  const config = { ...defaultOptions, ...options };

  return async (request: Request, response?: NextResponse) => {
    // Skip if disabled or service not enabled
    if (!config.enabled || !cavemanService.isEnabled()) {
      return response;
    }

    // Detect mode from header: X-Caveman-Mode
    const headerMode = request.headers.get('X-Caveman-Mode') as CavemanMode;
    const activeMode = headerMode || config.forceMode || config.defaultMode || cavemanService.getMode();

    if (activeMode === 'off') {
      return response;
    }

    // In a real proxy, the "filtering" Caveman output usually happens at the PROMPT level
    // (injecting the rules into the system prompt).
    // However, for this middleware to be a "filter" like RTK, it would need to
    // post-process the response if the model failed to be terse.

    // For now, we implement the "Response Indicator" and a placeholder for post-processing
    // as actual compression requires another LLM call or a very complex regex system.

    if (!response) return;

    try {
      const responseText = await response.text();

      // We add headers to let the client know that Caveman mode was requested/active
      const modifiedResponse = new NextResponse(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });

      modifiedResponse.headers.set('X-Caveman-Active', 'true');
      modifiedResponse.headers.set('X-Caveman-Mode', activeMode);

      return modifiedResponse;
    } catch (error) {
      console.warn('[Caveman Middleware] Processing failed:', error);
    }

    return response;
  };
}

/**
 * Higher-order function to wrap API handlers with Caveman support
 */
export function withCavemanFilter<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  options?: CavemanMiddlewareOptions
) {
  return async (...args: T): Promise<NextResponse> => {
    const response = await handler(...args);
    const request = args[0] as Request;

    const middleware = createCavemanMiddleware(options);
    return await middleware(request, response);
  };
}

export default createCavemanMiddleware;
