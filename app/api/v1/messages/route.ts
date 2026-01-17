/**
 * Claude Messages API Proxy
 * POST /api/v1/messages
 */

import { NextRequest } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/auth';
import { getToken } from '@/lib/token-manager';
import { mapModel } from '@/lib/model-mapping';

export const runtime = 'edge';
export const maxDuration = 60;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string | { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[];
}

interface ClaudeRequest {
    model: string;
    messages: ClaudeMessage[];
    max_tokens: number;
    stream?: boolean;
    system?: string;
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
}

/**
 * Convert Claude messages to Gemini format
 */
function convertClaudeToGemini(request: ClaudeRequest) {
    const contents: { role: 'user' | 'model'; parts: any[] }[] = [];

    for (const msg of request.messages) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts: any[] = [];

        if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === 'text' && block.text) {
                    parts.push({ text: block.text });
                } else if (block.type === 'image' && block.source) {
                    parts.push({
                        inlineData: {
                            mimeType: block.source.media_type,
                            data: block.source.data,
                        },
                    });
                }
            }
        }

        contents.push({ role, parts });
    }

    const geminiRequest: any = {
        contents,
        generationConfig: {
            maxOutputTokens: request.max_tokens,
            temperature: request.temperature,
            topP: request.top_p,
            stopSequences: request.stop_sequences,
        },
    };

    if (request.system) {
        geminiRequest.systemInstruction = { parts: [{ text: request.system }] };
    }

    return geminiRequest;
}

/**
 * Convert Gemini response to Claude format
 */
function convertGeminiToClaude(geminiResponse: any, model: string) {
    const candidate = geminiResponse.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';

    const stopReason = candidate?.finishReason === 'STOP' ? 'end_turn' :
        candidate?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';

    return {
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
            input_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
            output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
        },
    };
}

export async function POST(request: NextRequest) {
    // 1. Validate API Key
    const auth = validateApiKey(request);
    if (!auth.valid) {
        return unauthorizedResponse(auth.error!);
    }

    // 2. Parse request body
    let body: ClaudeRequest;
    try {
        body = await request.json();
    } catch (error) {
        return new Response(
            JSON.stringify({
                type: 'error',
                error: { type: 'invalid_request_error', message: 'Invalid JSON body' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 3. Get token
    const tokenResult = await getToken();
    if (!tokenResult) {
        return new Response(
            JSON.stringify({
                type: 'error',
                error: { type: 'overloaded_error', message: 'No available accounts' },
            }),
            { status: 529, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 4. Map model and convert request
    const geminiModel = mapModel(body.model);
    const geminiRequest = convertClaudeToGemini(body);

    console.log(`[API] Claude messages: model=${body.model}->${geminiModel}, stream=${body.stream}, account=${tokenResult.account.email}`);

    // 5. Forward to Gemini
    const endpoint = body.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `${GEMINI_API_BASE}/v1beta/models/${geminiModel}:${endpoint}`;

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
            console.error('[API] Gemini error:', error);
            return new Response(
                JSON.stringify({
                    type: 'error',
                    error: { type: 'api_error', message: error },
                }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Handle streaming
        if (body.stream) {
            const reader = response.body?.getReader();
            if (!reader) {
                return new Response('Stream error', { status: 500 });
            }

            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            const stream = new ReadableStream({
                async start(controller) {
                    let buffer = '';
                    let messageStarted = false;

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const data = line.slice(6);
                                    if (data === '[DONE]') continue;

                                    try {
                                        const geminiData = JSON.parse(data);
                                        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

                                        if (!messageStarted) {
                                            // Send message_start event
                                            const startEvent = {
                                                type: 'message_start',
                                                message: {
                                                    id: `msg_${Date.now()}`,
                                                    type: 'message',
                                                    role: 'assistant',
                                                    content: [],
                                                    model: body.model,
                                                    stop_reason: null,
                                                    stop_sequence: null,
                                                    usage: { input_tokens: 0, output_tokens: 0 },
                                                },
                                            };
                                            controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(startEvent)}\n\n`));

                                            // Send content_block_start event
                                            const blockStart = {
                                                type: 'content_block_start',
                                                index: 0,
                                                content_block: { type: 'text', text: '' },
                                            };
                                            controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(blockStart)}\n\n`));
                                            messageStarted = true;
                                        }

                                        if (text) {
                                            // Send content_block_delta event
                                            const deltaEvent = {
                                                type: 'content_block_delta',
                                                index: 0,
                                                delta: { type: 'text_delta', text },
                                            };
                                            controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(deltaEvent)}\n\n`));
                                        }

                                        // Check for finish
                                        if (geminiData.candidates?.[0]?.finishReason) {
                                            // Send content_block_stop
                                            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`));

                                            // Send message_delta with stop_reason
                                            const deltaMsg = {
                                                type: 'message_delta',
                                                delta: { stop_reason: 'end_turn', stop_sequence: null },
                                                usage: { output_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0 },
                                            };
                                            controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(deltaMsg)}\n\n`));

                                            // Send message_stop
                                            controller.enqueue(encoder.encode(`event: message_stop\ndata: {"type":"message_stop"}\n\n`));
                                        }
                                    } catch (e) {
                                        console.error('[API] Parse error:', e);
                                    }
                                }
                            }
                        }
                        controller.close();
                    } catch (error) {
                        console.error('[API] Stream error:', error);
                        controller.error(error);
                    }
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        }

        // Non-streaming response
        const geminiResponse = await response.json();
        const claudeResponse = convertGeminiToClaude(geminiResponse, body.model);

        return new Response(JSON.stringify(claudeResponse), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[API] Claude messages error:', error);
        return new Response(
            JSON.stringify({
                type: 'error',
                error: { type: 'api_error', message: `${error}` },
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
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, anthropic-version, x-api-key',
        },
    });
}
