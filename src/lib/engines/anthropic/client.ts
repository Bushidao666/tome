import Anthropic from '@anthropic-ai/sdk';
import type {
    Message as AnthropicMessage,
    MessageCreateParamsNonStreaming,
    TextBlock,
    ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages.mjs';

import { toAnthropic } from '$lib/engines/anthropic/message';
import { toAnthropicTools } from '$lib/engines/anthropic/tool';
import type { Client, ClientProps, Options, Tool, ToolCall } from '$lib/engines/types';
import { Message, Model } from '$lib/models';
import { fetch as tauriFetch } from '$lib/http';
import { error, info } from '$lib/logger';

export default class AnthropicClient implements Client {
    private sdk: Anthropic;
    private engineId: number;
    private baseUrl?: string;
    private isMiniMax: boolean;
    private defaultModels: string[];

    constructor(options: ClientProps) {
        if (!options.apiKey) {
            throw new Error('Anthropic apiKey obrigatório');
        }
        this.engineId = Number(options.engineId);
        this.baseUrl = options.url || undefined;
        this.isMiniMax = (this.baseUrl || '').includes('api.minimax.io/anthropic');
        this.defaultModels = this.isMiniMax
            ? ['MiniMax-M2', 'MiniMax-M2-Stable']
            : ['claude-3-5-sonnet-latest', 'claude-3-opus-latest'];
        this.sdk = new Anthropic({
            apiKey: options.apiKey,
            baseURL: this.baseUrl,
            fetch: tauriFetch as unknown as typeof fetch,
        });
    }

    async chat(
        model: Model,
        history: Message[],
        tools: Tool[] = [],
        options: Options = {}
    ): Promise<Message> {
        const system = history.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const messages = history.map(m => toAnthropic(m)).compact();

        const params: MessageCreateParamsNonStreaming = {
            model: model.name,
            max_tokens: model.metadata?.limits?.max_output_tokens || (this.isMiniMax ? 4096 : 1024),
            temperature: clamp(options.temperature ?? 0.8, 0.01, 1),
            messages,
        };

        if (system) params.system = system;
        if (tools.length > 0) params.tools = toAnthropicTools(tools);

        try {
            const response = await this.sdk.messages.create(params);
            return this.toMessage(response, model);
        } catch (err) {
            error('Anthropic chat failed', err);
            throw err;
        }
    }

    async models(): Promise<Model[]> {
        return this.defaultModels.map(name =>
            Model.new({
                id: `anthropic:${name}`,
                name,
                metadata: {
                    provider: this.isMiniMax ? 'MiniMax' : 'Anthropic',
                },
                engineId: this.engineId,
                supportsTools: true,
            })
        );
    }

    async info(name: string): Promise<Model> {
        return Model.new({
            id: `anthropic:${name}`,
            name,
            metadata: {
                provider: this.isMiniMax ? 'MiniMax' : 'Anthropic',
            },
            engineId: this.engineId,
            supportsTools: true,
        });
    }

    async connected(): Promise<boolean> {
        try {
            await this.sdk.messages.create({
                model: this.defaultModels[0],
                max_tokens: 1,
                messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
            });
            return true;
        } catch (err) {
            info('Anthropic connectivity check failed', err);
            return false;
        }
    }

    private toMessage(response: AnthropicMessage, model: Model): Message {
        const text = response.content
            .filter(block => block.type === 'text' && 'text' in block)
            .map(block => (block as TextBlock).text)
            .join('\n\n')
            .trim();

        const thought = response.content
            .filter(block => block.type === 'thinking' && 'thinking' in block)
            .map(block => (block as { thinking: string }).thinking)
            .join('\n\n')
            .trim();

        const toolCalls: ToolCall[] = response.content
            .filter(block => block.type === 'tool_use')
            .map(block => block as ToolUseBlock)
            .map(block => ({
                id: block.id,
                function: {
                    name: block.name,
                    arguments: block.input,
                },
            }));

        return Message.new({
            model: model.name,
            role: 'assistant',
            content: text,
            thought: thought || undefined,
            toolCalls,
        });
    }
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}
