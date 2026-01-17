/**
 * Upstream Client - Forward requests to Gemini API
 */

import { mapModel } from './model-mapping';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stop?: string | string[];
}

export interface GeminiContent {
    role: 'user' | 'model';
    parts: { text?: string; inlineData?: { mimeType: string; data: string } }[];
}

/**
 * Convert OpenAI messages to Gemini format
 */
function convertMessages(messages: ChatMessage[]): { contents: GeminiContent[]; systemInstruction?: { parts: { text: string }[] } } {
    let systemInstruction: { parts: { text: string }[] } | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
        // Handle system messages
        if (msg.role === 'system') {
            const text = typeof msg.content === 'string' ? msg.content :
                msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
            systemInstruction = { parts: [{ text }] };
            continue;
        }

        // Convert role
        const role = msg.role === 'assistant' ? 'model' : 'user';

        // Convert content
        const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];

        if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' && part.text) {
                    parts.push({ text: part.text });
                } else if (part.type === 'image_url' && part.image_url?.url) {
                    // Handle base64 images
                    const url = part.image_url.url;
                    if (url.startsWith('data:')) {
                        const [header, data] = url.split(',');
                        const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                        parts.push({ inlineData: { mimeType, data } });
                    }
                    // TODO: Handle URL images by fetching and converting
                }
            }
        }

        contents.push({ role, parts });
    }

    return { contents, systemInstruction };
}

/**
 * Convert Gemini response to OpenAI format
 */
function convertResponse(geminiResponse: any, model: string): any {
    const candidate = geminiResponse.candidates?.[0];
    if (!candidate) {
        return {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
    }

    const content = candidate.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const finishReason = candidate.finishReason === 'STOP' ? 'stop' :
        candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop';

    return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content,
                },
                finish_reason: finishReason,
            },
        ],
        usage: {
            prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
            completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
        },
    };
}

/**
 * Forward a chat completion request to Gemini API
 */
export async function forwardChatCompletion(
    request: ChatCompletionRequest,
    accessToken: string
): Promise<Response> {
    const geminiModel = mapModel(request.model);
    const { contents, systemInstruction } = convertMessages(request.messages);

    // Build Gemini request
    const geminiRequest: any = {
        contents,
        generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.max_tokens,
            topP: request.top_p,
            stopSequences: request.stop ? (Array.isArray(request.stop) ? request.stop : [request.stop]) : undefined,
        },
    };

    if (systemInstruction) {
        geminiRequest.systemInstruction = systemInstruction;
    }

    const endpoint = request.stream ? 'streamGenerateContent' : 'generateContent';
    const url = `${GEMINI_API_BASE}/v1beta/models/${geminiModel}:${endpoint}${request.stream ? '?alt=sse' : ''}`;

    console.log(`[Upstream] Forwarding to ${geminiModel} (stream=${request.stream})`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(geminiRequest),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[Upstream] Gemini API error:', error);
        return new Response(
            JSON.stringify({
                error: {
                    message: `Upstream error: ${error}`,
                    type: 'upstream_error',
                    code: response.status,
                },
            }),
            {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }

    // Handle streaming response
    if (request.stream) {
        const reader = response.body?.getReader();
        if (!reader) {
            return new Response('Stream error', { status: 500 });
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
            async start(controller) {
                let buffer = '';

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
                                if (data === '[DONE]') {
                                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                                    continue;
                                }

                                try {
                                    const geminiData = JSON.parse(data);
                                    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

                                    if (text) {
                                        const openaiChunk = {
                                            id: `chatcmpl-${Date.now()}`,
                                            object: 'chat.completion.chunk',
                                            created: Math.floor(Date.now() / 1000),
                                            model: request.model,
                                            choices: [
                                                {
                                                    index: 0,
                                                    delta: { content: text },
                                                    finish_reason: null,
                                                },
                                            ],
                                        };
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                                    }

                                    // Check for finish reason
                                    if (geminiData.candidates?.[0]?.finishReason) {
                                        const finishChunk = {
                                            id: `chatcmpl-${Date.now()}`,
                                            object: 'chat.completion.chunk',
                                            created: Math.floor(Date.now() / 1000),
                                            model: request.model,
                                            choices: [
                                                {
                                                    index: 0,
                                                    delta: {},
                                                    finish_reason: 'stop',
                                                },
                                            ],
                                        };
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
                                    }
                                } catch (e) {
                                    console.error('[Upstream] Parse error:', e);
                                }
                            }
                        }
                    }

                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error) {
                    console.error('[Upstream] Stream error:', error);
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

    // Handle non-streaming response
    const geminiResponse = await response.json();
    const openaiResponse = convertResponse(geminiResponse, request.model);

    return new Response(JSON.stringify(openaiResponse), {
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Forward a request directly to Gemini API (for native Gemini protocol)
 */
export async function forwardToGemini(
    path: string,
    method: string,
    body: any,
    accessToken: string
): Promise<Response> {
    const url = `${GEMINI_API_BASE}${path}`;

    console.log(`[Upstream] Forwarding to Gemini: ${method} ${path}`);

    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    // Pass through the response
    return new Response(response.body, {
        status: response.status,
        headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
        },
    });
}
