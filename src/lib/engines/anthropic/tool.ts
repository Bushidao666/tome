import type { Tool } from '$lib/engines/types';
import type { Tool as AnthropicTool, ToolParam } from '@anthropic-ai/sdk/resources/messages.mjs';

/**
 * Converte `Tool[]` canonical (Tome) para o formato Anthropic Messages API
 */
export function toAnthropicTools(tools: Tool[]): AnthropicTool[] {
    return tools.map(tool => ({
        type: 'function',
        function: normalize(tool),
    }));
}

function normalize(tool: Tool): ToolParam['function'] {
    const params = tool.function.parameters;
    return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: {
            type: 'object',
            properties: params.properties,
            required: params.required,
        },
    } as ToolParam['function'];
}

export default { toAnthropicTools };

