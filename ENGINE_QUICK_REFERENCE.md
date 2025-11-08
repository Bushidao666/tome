# TOME ENGINE INTEGRATION - QUICK REFERENCE

## Essential Checklist for Anthropic Implementation

### 1. Create Core Files

**Step 1: `/src/lib/engines/anthropic/client.ts`**
- Implement `Client` interface
- Constructor takes `ClientProps` with `apiKey` and `url`
- Key methods:
  - `chat()` - Send message to Claude API
  - `models()` - List available Claude models
  - `info()` - Get model metadata
  - `connected()` - Validate credentials

**Step 2: `/src/lib/engines/anthropic/message.ts`**
- Export `from()` function converting `Message` to Anthropic format
- Handle message roles: system, user, assistant, tool
- Format tool calls and responses
- Return Anthropic-compatible message structure

### 2. Register Engine Type

**File: `/src/lib/models/engine.svelte.ts`**

Add to type union (line 23):
```typescript
type EngineType = 'ollama' | 'openai' | 'gemini' | 'anthropic' | 'openai-compat';
```

Add to AVAILABLE_MODELS (line 10):
```typescript
const AVAILABLE_MODELS: Record<EngineType, 'all' | string[]> = {
    anthropic: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20250219',
        // ... more models
    ],
    // ... rest of engines
};
```

Add client mapping in `get client()` (line 54):
```typescript
const Client = {
    anthropic: Anthropic,  // ADD THIS
    ollama: Ollama,
    openai: OpenAI,
    gemini: Gemini,
    'openai-compat': OpenAI,
}[this.type];
```

Add display name in `get displayName()` (line 44):
```typescript
get displayName() {
    return {
        anthropic: 'Anthropic',  // ADD THIS
        ollama: 'Ollama',
        openai: 'OpenAI',
        gemini: 'Gemini',
        'openai-compat': 'OpenAI-Compatible Engine',
    }[this.type];
}
```

### 3. Create Onboarding UI

**File: `/src/routes/onboarding/models/anthropic/+page.svelte`**
```svelte
<script lang="ts">
    import LabeledSection from '$components/Forms/LabeledSection.svelte';
    import Input from '$components/Input.svelte';
    import Layout from '$components/Layouts/Default.svelte';
    import Modal from '$components/Onboarding/Modal.svelte';
    import { Engine } from '$lib/models';

    let engine = $state(Engine.findBy({ type: 'anthropic' }) as Engine);
    let valid = $state(false);

    function onkeyup() {
        valid = engine.options.apiKey !== '';
    }
</script>

<Layout>
    <Modal {engine} disabled={!valid}>
        <LabeledSection icon="Key" title="API Key" class="border-none">
            <Input
                {onkeyup}
                bind:value={engine.options.apiKey}
                required
                type="password"
                placeholder="API Key"
            />
        </LabeledSection>
    </Modal>
</Layout>
```

### 4. Database Migration

**File: `/src-tauri/src/migrations.rs`**

Add new migration at end of migrations vector:
```rust
Migration {
    version: XX,  // Use next version number
    description: "add_anthropic_engine",
    sql: r#"
INSERT INTO engines ("name", "type", "options") VALUES
(
    "Anthropic",
    "anthropic",
    json_object(
        'url',
        'https://api.anthropic.com',
        'apiKey',
        ''
    )
);
    "#,
    kind: MigrationKind::Up,
}
```

## Code Patterns to Follow

### Message Formatting Pattern

```typescript
// Basic structure
export function from(message: Message): YourProviderMessage {
    if (message.role == 'user') {
        return { role: 'user', content: message.content };
    }
    if (message.role == 'assistant') {
        return formatAssistantMessage(message);
    }
    if (message.role == 'tool') {
        return formatToolMessage(message);
    }
    if (message.role == 'system') {
        return formatSystemMessage(message);
    }
}
```

### Client Pattern

```typescript
export default class Anthropic implements Client {
    private options: ClientProps;
    private client: AnthropicClient;
    id = 'anthropic';

    constructor(options: ClientProps) {
        this.options = options;
        this.client = new AnthropicClient({
            apiKey: options.apiKey,
            baseURL: options.url,
        });
    }

    async chat(
        model: Model,
        history: Message[],
        tools?: Tool[],
        options?: Options
    ): Promise<Message> {
        const messages = history.map(m => AnthropicMessage.from(m));
        
        const response = await this.client.messages.create({
            model: model.name,
            messages,
            tools,
            max_tokens: 4096,
            temperature: options?.temperature,
        });

        // Extract response
        let toolCalls: ToolCall[] = [];
        let content = '';
        
        // Parse response content blocks
        for (const block of response.content) {
            if (block.type === 'text') {
                content = block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    function: {
                        name: block.name,
                        arguments: block.input,
                    },
                });
            }
        }

        return Message.new({
            model: model.name,
            role: 'assistant',
            content,
            toolCalls,
        });
    }

    async models(): Promise<Model[]> {
        // Return hardcoded list or fetch from API
        const models = [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
        ];
        
        return models.map(name => Model.new({
            id: `anthropic:${name}`,
            name,
            engineId: this.options.engineId,
            supportsTools: true,
            metadata: {},
        }));
    }

    async info(model: string): Promise<Model> {
        return Model.new({
            id: `anthropic:${model}`,
            name: model,
            engineId: this.options.engineId,
            supportsTools: true,
            metadata: {},
        });
    }

    async connected(): Promise<boolean> {
        try {
            if (!this.options.apiKey) return false;
            await this.client.messages.create({
                model: 'claude-3-5-haiku-20241022',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 10,
            });
            return true;
        } catch {
            return false;
        }
    }
}
```

## Important Gotchas

### System Messages
- Anthropic may handle system messages differently
- Check if they're separate or in message history

### Tool Format
- Anthropic uses `tool_use` blocks in content
- Different from OpenAI's `tool_calls` array
- May need custom parsing logic

### Stop Reason
- Anthropic returns `stop_reason` indicating why model stopped
- `stop_reason: 'tool_use'` means tool call
- `stop_reason: 'end_turn'` means response complete

### Message Structure
- Anthropic has distinct content blocks
- Must iterate through blocks to extract content and tool uses
- Similar to but different from Gemini's "parts"

### Temperature Handling
- Anthropic may support different temperature ranges
- Check API docs for valid values

### Max Tokens
- Required parameter for Anthropic
- Must be set in chat request
- Consider what value to use (4096 is safe)

## Testing Flow

1. Create engine in UI
2. Verify `connected()` returns true
3. Check models list appears in dropdown
4. Start chat with Claude model
5. Send simple message
6. Verify response appears
7. Enable MCP server
8. Send message that triggers tool use
9. Verify tool executes and responds
10. Check tool calls saved to database

## Files to Reference While Implementing

```
src/lib/engines/types.ts                    # Core interfaces (73 lines)
src/lib/engines/openai/client.ts            # OpenAI example (105 lines)
src/lib/engines/openai/message.ts           # Message example (65 lines)
src/lib/engines/gemini/client.ts            # Alternative pattern (115 lines)
src/lib/engines/gemini/tool.ts              # Tool conversion example (73 lines)
src/lib/models/engine.svelte.ts             # Engine registration (108 lines)
src/lib/dispatch.ts                         # Tool execution flow (84 lines)
src/routes/onboarding/models/openai/+page.svelte  # UI example (30 lines)
```

## Import Statement

Add to `/src/lib/engines/anthropic/client.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import AnthropicMessage from '$lib/engines/anthropic/message';
import type { Client, ClientProps, Options, Tool, ToolCall } from '$lib/engines/types';
import { Message, Model } from '$lib/models';
```

Add to `/src/lib/models/engine.svelte.ts`:
```typescript
import Anthropic from '$lib/engines/anthropic/client';
```

## Package.json Addition

You may need to add:
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x.x"
  }
}
```

## Key Decision Points

**1. Model Listing**
- Option A: Hardcode list of Claude models
- Option B: Call Anthropic API to list models
- **Recommendation**: Start with hardcoded list

**2. System Messages**
- Check if Anthropic API supports system message parameter
- If yes: send separately
- If no: prepend to first user message

**3. Tool Response Format**
- Verify exact format Anthropic expects
- May differ from OpenAI/Gemini
- Check for required fields like `tool_use_id`

**4. Extended Thinking**
- Claude supports thinking tokens
- Parse `thinking` content blocks separately
- Store in `message.thought` field (like Ollama)

**5. Error Handling**
- Handle 401 (invalid key)
- Handle 429 (rate limit)
- Handle 500 (server error)
- All should fail gracefully

