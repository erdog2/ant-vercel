/**
 * OpenAI Chat Completions API Proxy
 * POST /api/v1/chat/completions
 */

import { NextRequest } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { getToken } from '@/lib/token-manager';
import { forwardChatCompletion, ChatCompletionRequest } from '@/lib/upstream';

export const runtime = 'edge';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    // 1. Validate API Key
    const auth = validateApiKey(request);
    if (!auth.valid) {
        return unauthorizedResponse(auth.error!);
    }

    // 2. Parse request body
    let body: ChatCompletionRequest;
    try {
        body = await request.json();
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: {
                    message: 'Invalid JSON body',
                    type: 'invalid_request_error',
                },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Validate required fields
    if (!body.model) {
        return new Response(
            JSON.stringify({
                error: {
                    message: 'Missing required field: model',
                    type: 'invalid_request_error',
                },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return new Response(
            JSON.stringify({
                error: {
                    message: 'Missing required field: messages',
                    type: 'invalid_request_error',
                },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 3. Get token
    const tokenResult = await getToken();
    if (!tokenResult) {
        return new Response(
            JSON.stringify({
                error: {
                    message: 'No available accounts. Please configure ACCOUNTS_JSON.',
                    type: 'server_error',
                },
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 4. Forward to upstream
    console.log(`[API] Chat completion: model=${body.model}, stream=${body.stream}, account=${tokenResult.account.email}`);

    try {
        return await forwardChatCompletion(body, tokenResult.token);
    } catch (error) {
        console.error('[API] Chat completion error:', error);
        return new Response(
            JSON.stringify({
                error: {
                    message: `Internal server error: ${error}`,
                    type: 'server_error',
                },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
