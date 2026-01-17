/**
 * Model Mapping - Convert between different API model names
 */

// Default model mappings: OpenAI/Claude model names -> Gemini model names
const DEFAULT_MAPPINGS: Record<string, string> = {
    // GPT-4 variants -> Gemini 1.5 Pro
    'gpt-4': 'gemini-1.5-pro',
    'gpt-4-turbo': 'gemini-1.5-pro',
    'gpt-4-turbo-preview': 'gemini-1.5-pro',
    'gpt-4-0125-preview': 'gemini-1.5-pro',
    'gpt-4-1106-preview': 'gemini-1.5-pro',
    'gpt-4o': 'gemini-1.5-pro',
    'gpt-4o-mini': 'gemini-1.5-flash',

    // GPT-3.5 variants -> Gemini 1.5 Flash
    'gpt-3.5-turbo': 'gemini-1.5-flash',
    'gpt-3.5-turbo-0125': 'gemini-1.5-flash',
    'gpt-3.5-turbo-1106': 'gemini-1.5-flash',

    // Claude variants -> Gemini equivalents
    'claude-3-opus-20240229': 'gemini-1.5-pro',
    'claude-3-sonnet-20240229': 'gemini-1.5-pro',
    'claude-3-haiku-20240307': 'gemini-1.5-flash',
    'claude-3-5-sonnet-20240620': 'gemini-1.5-pro',
    'claude-3-5-sonnet-20241022': 'gemini-1.5-pro',

    // Direct Gemini model names (passthrough)
    'gemini-1.5-pro': 'gemini-1.5-pro',
    'gemini-1.5-flash': 'gemini-1.5-flash',
    'gemini-1.5-flash-8b': 'gemini-1.5-flash-8b',
    'gemini-2.0-flash-exp': 'gemini-2.0-flash-exp',
    'gemini-2.0-flash-thinking-exp': 'gemini-2.0-flash-thinking-exp',
    'gemini-exp-1206': 'gemini-exp-1206',

    // Image generation models
    'dall-e-3': 'imagen-3.0-generate-001',
    'dall-e-2': 'imagen-3.0-generate-001',
};

// Custom mappings from environment
let customMappings: Record<string, string> = {};

/**
 * Load custom model mappings from environment
 */
export function loadCustomMappings(): void {
    try {
        const mappingJson = process.env.MODEL_MAPPING_JSON || '{}';
        customMappings = JSON.parse(mappingJson);
        console.log('[ModelMapping] Loaded custom mappings:', Object.keys(customMappings).length);
    } catch (error) {
        console.error('[ModelMapping] Failed to parse MODEL_MAPPING_JSON:', error);
        customMappings = {};
    }
}

/**
 * Map a model name to its Gemini equivalent
 */
export function mapModel(modelName: string): string {
    // Load custom mappings if not loaded
    if (Object.keys(customMappings).length === 0) {
        loadCustomMappings();
    }

    // Check custom mappings first
    if (customMappings[modelName]) {
        return customMappings[modelName];
    }

    // Then check default mappings
    if (DEFAULT_MAPPINGS[modelName]) {
        return DEFAULT_MAPPINGS[modelName];
    }

    // If no mapping found, return as-is (might be a valid Gemini model name)
    return modelName;
}

/**
 * Check if a model is an image generation model
 */
export function isImageModel(modelName: string): boolean {
    const imageModels = ['dall-e-3', 'dall-e-2', 'imagen-3.0-generate-001'];
    return imageModels.includes(modelName.toLowerCase());
}

/**
 * Get the list of available models (for /v1/models endpoint)
 */
export function getAvailableModels(): { id: string; object: string; created: number; owned_by: string }[] {
    const models = [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-3.5-turbo',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash-thinking-exp',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-5-sonnet-20241022',
        ...Object.keys(customMappings),
    ];

    // Deduplicate
    const uniqueModels = Array.from(new Set(models));

    return uniqueModels.map(id => ({
        id,
        object: 'model',
        created: 1677610602,
        owned_by: 'antigravity-proxy',
    }));
}
