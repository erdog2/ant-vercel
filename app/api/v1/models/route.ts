/**
 * List Models API
 * GET /api/v1/models
 */

import { NextRequest } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { getAvailableModels } from '@/lib/model-mapping';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
    // Validate API Key
    const auth = validateApiKey(request);
    if (!auth.valid) {
        return unauthorizedResponse(auth.error!);
    }

    const models = getAvailableModels();

    return new Response(
        JSON.stringify({
            object: 'list',
            data: models,
        }),
        {
            headers: { 'Content-Type': 'application/json' },
        }
    );
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
