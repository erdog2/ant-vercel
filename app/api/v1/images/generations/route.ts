/**
 * Image Generation API Proxy
 * POST /api/v1/images/generations
 */

import { NextRequest } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { getToken } from '@/lib/token-manager';

export const runtime = 'edge';
export const maxDuration = 60;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

interface ImageGenerationRequest {
    model?: string;
    prompt: string;
    n?: number;
    size?: string;
    quality?: string;
    response_format?: 'url' | 'b64_json';
}

export async function POST(request: NextRequest) {
    // 1. Validate API Key
    const auth = validateApiKey(request);
    if (!auth.valid) {
        return unauthorizedResponse(auth.error!);
    }

    // 2. Parse request body
    let body: ImageGenerationRequest;
    try {
        body = await request.json();
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: { message: 'Invalid JSON body', type: 'invalid_request_error' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    if (!body.prompt) {
        return new Response(
            JSON.stringify({
                error: { message: 'Missing required field: prompt', type: 'invalid_request_error' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 3. Get token
    const tokenResult = await getToken();
    if (!tokenResult) {
        return new Response(
            JSON.stringify({
                error: { message: 'No available accounts', type: 'server_error' },
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 4. Determine aspect ratio from size
    let aspectRatio = '1:1';
    if (body.size) {
        const sizeMap: Record<string, string> = {
            '1024x1024': '1:1',
            '1792x1024': '16:9',
            '1024x1792': '9:16',
            '1024x768': '4:3',
            '768x1024': '3:4',
        };
        aspectRatio = sizeMap[body.size] || '1:1';
    }

    // 5. Build Gemini Imagen request
    const geminiRequest = {
        instances: [{ prompt: body.prompt }],
        parameters: {
            sampleCount: body.n || 1,
            aspectRatio,
        },
    };

    console.log(`[API] Image generation: prompt="${body.prompt.substring(0, 50)}...", account=${tokenResult.account.email}`);

    // 6. Call Imagen API
    const url = `${GEMINI_API_BASE}/v1beta/models/imagen-3.0-generate-001:predict`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenResult.token}`,
            },
            body: JSON.stringify(geminiRequest),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[API] Imagen error:', error);
            return new Response(
                JSON.stringify({
                    error: { message: `Upstream error: ${error}`, type: 'api_error' },
                }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const geminiResponse = await response.json();

        // 7. Convert to OpenAI format
        const images = geminiResponse.predictions?.map((pred: any, index: number) => {
            if (body.response_format === 'b64_json') {
                return { b64_json: pred.bytesBase64Encoded };
            }
            // For URL format, we'd need to host the image somewhere
            // For now, return b64_json as that's more portable
            return { b64_json: pred.bytesBase64Encoded };
        }) || [];

        return new Response(
            JSON.stringify({
                created: Math.floor(Date.now() / 1000),
                data: images,
            }),
            { headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[API] Image generation error:', error);
        return new Response(
            JSON.stringify({
                error: { message: `${error}`, type: 'server_error' },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

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
