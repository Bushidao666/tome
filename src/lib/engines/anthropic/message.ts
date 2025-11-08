import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.mjs';

import { Message, Session } from '$lib/models';
import type { ToolCall } from '$lib/engines/types';

/**
 * Converte um Message (ORM Tome) em MessageParam (Anthropic)
 * Observação: mensagens `system` são passadas separadamente via `system` no client.
 */
export function toAnthropic(message: Message): MessageParam | undefined {
    switch (message.role) {
        case 'system':
            return undefined; // tratado no client
        case 'assistant':
            return assistant(message);
        case 'tool':
            return toolResponse(message);
        default:
            return user(message);
    }
}

function user(message: Message): MessageParam {
    return {
        role: 'user',
        content: [
            {
                type: 'text',
                text: message.content,
            },
        ],
    };
}

function assistant(message: Message): MessageParam {
    const content: MessageParam['content'] = [];

    if (message.thought) {
        content.push({
            // @ts-expect-error: Anthropic typings ainda não incluem bloco `thinking`
            type: 'thinking',
            thinking: message.thought,
        });
    }

    if (message.content) {
        content.push({
            type: 'text',
            text: message.content,
        });
    }

    if (message.toolCalls.length) {
        message.toolCalls.forEach(call => {
            content.push({
                type: 'tool_use',
                id: call.id || '',
                name: call.function.name,
                input: call.function.arguments,
            });
        });
    }

    return {
        role: 'assistant',
        content: content.length
            ? content
            : [
                  {
                      type: 'text',
                      text: '',
                  },
              ],
    };
}

function toolResponse(message: Message): MessageParam {
    const session = Session.find(message.sessionId as number);
    const call: ToolCall | undefined = session.messages
        .flatMap(m => m.toolCalls)
        .find(tc => tc.id === message.toolCallId);

    return {
        role: 'user',
        content: [
            {
                type: 'tool_result',
                tool_use_id: call?.id || '',
                content: [
                    {
                        type: 'text',
                        text: message.content,
                    },
                ],
            },
        ],
    };
}

export default { toAnthropic };
