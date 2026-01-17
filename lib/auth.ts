/**
 * API Key Authentication Middleware
 */

import { NextRequest } from 'next/server';

export interface AuthResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate the API key from request headers
 */
export function validateApiKey(request: NextRequest): AuthResult {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
        return {
            valid: false,
            error: 'Missing Authorization header',
        };
    }

    // Extract Bearer token
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return {
            valid: false,
            error: 'Invalid Authorization header format. Expected: Bearer <token>',
        };
    }

    const providedKey = match[1];
    const expectedKey = process.env.PROXY_API_KEY;

    if (!expectedKey) {
        console.error('[Auth] PROXY_API_KEY is not configured');
        return {
            valid: false,
            error: 'Server configuration error',
        };
    }

    if (providedKey !== expectedKey) {
        return {
            valid: false,
            error: 'Invalid API key',
        };
    }

    return { valid: true };
}

/**
 * Create an unauthorized error response
 */
export function unauthorizedResponse(error: string): Response {
    return new Response(
        JSON.stringify({
            error: {
                message: error,
                type: 'invalid_request_error',
                code: 'invalid_api_key',
            },
        }),
        {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );
}
