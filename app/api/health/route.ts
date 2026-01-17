/**
 * Health Check API
 * GET /api/health
 */

import { getAccountCount } from '@/lib/token-manager';

export const runtime = 'edge';

export async function GET() {
    const accountCount = getAccountCount();

    return new Response(
        JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            accounts: accountCount,
            version: '1.0.0',
        }),
        {
            headers: { 'Content-Type': 'application/json' },
        }
    );
}
