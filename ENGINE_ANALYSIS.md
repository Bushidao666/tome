# TOME LLM ENGINE INTEGRATION ANALYSIS
## Comprehensive Guide for Implementing New LLM Providers

---

## EXECUTIVE SUMMARY

The Tome project uses a **plugin-based engine architecture** where each LLM provider (OpenAI, Gemini, Ollama) implements a common `Client` interface. The system is highly modular, with clear separation between:
- **Engine Definition** (client connection logic)
- **Message Formatting** (provider-specific message transformation)
- **Tool Integration** (MCP tool handling)
- **Model Management** (model listing and metadata)
- **Database Configuration** (engine settings storage)
- **UI Integration** (onboarding and selection flows)

---

## 1. ENGINE STRUCTURE ANALYSIS

### 1.1 Directory Structure

```
src/lib/engines/
├── types.ts                    # Central type definitions
├── openai/
│   ├── client.ts               # OpenAI Client implementation
│   └── message.ts              # Message formatting for OpenAI
├── gemini/
│   ├── client.ts               # Gemini Client implementation
│   ├── message.ts              # Message formatting for Gemini
│   └── tool.ts                 # Tool conversion for Gemini
├── ollama/
│   ├── client.ts               # Ollama Client implementation
│   └── message.ts              # Message formatting for Ollama
```

### 1.2 Common Interface Definition
**File**: `/home/user/tome/src/lib/engines/types.ts`

All engines must implement the `Client` interface:

```typescript
export interface Client {
    chat(
        model: Model,
        history: TomeMessage[],
        tools?: Tool[],
        options?: Options
    ): Promise<TomeMessage>;
    
    models(): Promise<Model[]>;
    info(model: string): Promise<Model>;
    connected(): Promise<boolean>;
}
```

**Key Interface Elements**:
- `chat()` - Core method that sends messages to the model
- `models()` - Lists available models from the provider
- `info()` - Retrieves detailed info about a specific model
- `connected()` - Validates API credentials and connectivity

### 1.3 Client Options Interface

```typescript
export interface ClientOptions {
    apiKey: string;
    url: string;
}

export interface ClientProps extends ClientOptions {
    engineId: number;
}
```

**Key Points**:
- `apiKey`: Authentication credential
- `url`: Provider's API endpoint
- `engineId`: Database reference to this engine instance

### 1.4 Options for Model Requests

```typescript
export interface Options {
    num_ctx?: number;      // Context window size
    temperature?: number;  // Sampling temperature
}
```

These are passed from the session config to control model behavior.

---

## 2. MESSAGE FORMATTING

### 2.1 Role Type Definition

```typescript
export type Role =
    | 'system'
    | 'user'
    | 'assistant'
    | 'tool'
    | 'function'
    | 'developer'     // OpenAI specific
    | 'model';        // Gemini specific
```

### 2.2 OpenAI Message Formatting
**File**: `/home/user/tome/src/lib/engines/openai/message.ts`

OpenAI uses a straightforward format:

```typescript
export function from(message: Message): OpenAI.ChatCompletionMessageParam {
    if (message.role == 'assistant') {
        return fromAssistant(message);
    } else if (message.role == 'system') {
        return fromSystem(message);
    } else if (['tool', 'function'].includes(message.role)) {
        return fromTool(message);
    } else {
        return fromUser(message);
    }
}

// User messages
export function fromUser(message: Message): OpenAI.ChatCompletionUserMessageParam {
    return {
        role: 'user',
        content: message.content,
    };
}

// Assistant messages with tool calls
export function fromAssistant(message: Message): OpenAI.ChatCompletionAssistantMessageParam {
    return {
        role: 'assistant',
        content: message.content,
        tool_calls: toolCalls(message),  // Maps to OpenAI tool_calls format
    };
}

// Tool response messages
export function fromTool(message: Message): OpenAI.ChatCompletionToolMessageParam {
    return {
        tool_call_id: message.toolCallId as string,
        role: 'tool',
        content: message.content,
    };
}

// System messages
export function fromSystem(message: Message): OpenAI.ChatCompletionSystemMessageParam {
    return {
        role: 'system',
        content: message.content,
    };
}

// Tool call formatting
function toolCalls(message: Message): OpenAI.ChatCompletionMessageToolCall[] | undefined {
    if (message.toolCalls.length == 0) return;
    
    return message.toolCalls.map(call => ({
        id: call.id as string,
        type: 'function',
        function: {
            name: call.function.name,
            arguments: JSON.stringify(call.function.arguments),
        },
    }));
}
```

### 2.3 Gemini Message Formatting
**File**: `/home/user/tome/src/lib/engines/gemini/message.ts`

Gemini uses a different format with "parts" and special handling:

```typescript
export function from(message: Message): Content | undefined {
    if (message.role == 'user') {
        return fromUser(message);
    } else if (message.role == 'assistant' && !message.content) {
        return fromToolCall(message);
    } else if (message.role == 'assistant') {
        return fromAssistant(message);
    } else if (message.role == 'tool') {
        return fromToolResponse(message);
    } else if (message.role == 'system') {
        return;  // System messages handled separately
    } else {
        return fromAny(message);
    }
}

// User messages
function fromUser(message: Message): Content {
    return {
        role: 'user',
        parts: [{text: message.content}],
    };
}

// Assistant messages with text
function fromAssistant(message: Message): Content {
    return {
        role: 'model',  // Note: Gemini uses 'model' instead of 'assistant'
        parts: [{text: message.content}],
    };
}

// Tool call representation (when no text content)
function fromToolCall(message: Message): Content | undefined {
    if (message.toolCalls.length == 0) return;
    
    return {
        role: 'model',
        parts: [{
            functionCall: {
                id: message.toolCalls[0].id,
                name: message.toolCalls[0].function.name,
                args: message.toolCalls[0].function.arguments,
            },
        }],
    };
}

// Tool response handling
function fromToolResponse(message: Message): Content {
    const session = Session.find(message.sessionId as number);
    const call = session.messages.flatMap(m => m.toolCalls).find(
        tc => tc.id == message.toolCallId
    );
    
    return {
        role: 'user',
        parts: [{
            functionResponse: {
                name: call?.function.name,
                response: {result: message.content},
            },
        }],
    };
}
```

**Key Differences**:
- System messages are NOT included in the message list; handled separately as `systemInstruction`
- Role is 'model' (not 'assistant')
- Tool responses are sent as 'user' messages with `functionResponse` parts

### 2.4 Ollama Message Formatting
**File**: `/home/user/tome/src/lib/engines/ollama/message.ts`

Ollama uses a simplified format:

```typescript
export function from(message: Message): OllamaMessage {
    return {
        role: message.role,
        content: message.content,
        tool_calls: message.toolCalls?.map(c => ({
            function: {
                name: c.function.name,
                arguments: c.function.arguments,
            },
        })),
    };
}
```

**Special Feature**: Ollama handles "thinking" content:

```typescript
let thought: string | undefined;
let content: string = response.message.content
    .replace(/\.$/, '')
    .replace(/^"/, '')
    .replace(/"$/, '');

if (content.includes('<think>')) {
    [thought, content] = content.split('</think>');
    thought = thought.replace('<think>', '').trim();
    content = content.trim();
}
```

---

## 3. CLIENT IMPLEMENTATION

### 3.1 OpenAI Client
**File**: `/home/user/tome/src/lib/engines/openai/client.ts`

```typescript
import { OpenAI as OpenAIClient } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.mjs';

export default class OpenAI implements Client {
    private options: ClientProps;
    private client: OpenAIClient;
    id = 'openai';

    constructor(options: ClientProps) {
        this.options = options;
        this.client = new OpenAIClient({
            apiKey: options.apiKey,
            baseURL: options.url,
            fetch,
            dangerouslyAllowBrowser: true,  // Important: allows browser usage
        });
    }

    async chat(
        model: Model,
        history: Message[],
        tools: Tool[] = [],
        _options: Options = {}
    ): Promise<Message> {
        // Convert Tome messages to OpenAI format
        const messages = history.map(m => OpenAiMessage.from(m));
        
        const completion: ChatCompletionCreateParamsNonStreaming = {
            model: model.name,
            messages,
        };

        // Add tools if provided
        if (tools.length > 0) {
            completion.tools = tools;  // Direct pass-through
        }

        // Send request
        const response = await this.client.chat.completions.create(completion);
        const { role, content, tool_calls } = response.choices[0].message;

        // Parse tool calls if present
        let toolCalls: ToolCall[] = [];
        if (tool_calls) {
            toolCalls = tool_calls.map(tc => ({
                function: {
                    name: tc.function.name,
                    arguments: JSON.parse(tc.function.arguments),
                },
            }));
        }

        return Message.new({
            model: model.name,
            name: '',
            role,
            content: content || '',
            toolCalls,
        });
    }

    async models(): Promise<Model[]> {
        return (await this.client.models.list({ timeout: 1000 })).data.map(model => {
            const { id, ...metadata } = model;
            const name = id.replace('models/', '');

            return Model.new({
                id: `${this.id}:${name}`,
                name,
                metadata,
                engineId: this.options.engineId,
                supportsTools: true,
            });
        });
    }

    async info(model: string): Promise<Model> {
        const { id, ...metadata } = await this.client.models.retrieve(model);

        return Model.new({
            id,
            name: id,
            metadata,
            engineId: this.options.engineId,
            supportsTools: true,
        });
    }

    async connected(): Promise<boolean> {
        try {
            if (this.client.apiKey == '') return false;

            const resp = await this.client.models.list({ timeout: 1000 }).asResponse();
            const body = await resp.json();
            return !Object.hasOwn(body, 'error');
        } catch {
            return false;
        }
    }
}
```

### 3.2 Gemini Client
**File**: `/home/user/tome/src/lib/engines/gemini/client.ts`

```typescript
import { type GenerateContentConfig, GoogleGenAI } from '@google/genai';

export default class Gemini implements Client {
    private options: ClientProps;
    private client: GoogleGenAI;
    id = 'gemini';

    constructor(options: ClientProps) {
        this.options = options;
        this.client = new GoogleGenAI({
            apiKey: options.apiKey,
        });
    }

    async chat(
        model: Model,
        history: Message[],
        tools?: Tool[],
        options?: Options
    ): Promise<Message> {
        // Gemini treats system messages separately
        const systemMessages = history.filter(m => m.role === 'system');
        const nonSystemMessages = history.filter(m => m.role !== 'system');

        // Convert non-system messages to Gemini format
        const messages = nonSystemMessages.map(m => GeminiMessage.from(m)).compact();

        const config: GenerateContentConfig = {
            temperature: options?.temperature,
        };

        // Add system instruction if present
        if (systemMessages.length > 0) {
            const systemInstruction = systemMessages.map(m => m.content).join('\n\n');
            config.systemInstruction = {
                parts: [{ text: systemInstruction }],
            };
        }

        // Convert tools to Gemini format
        if (tools && tools.length) {
            config.tools = GeminiTools.from(tools);
        }

        const { text, functionCalls } = await this.client.models.generateContent({
            model: model.name,
            contents: messages,
            config,
        });

        // Parse function calls
        let toolCalls: ToolCall[] = [];
        if (functionCalls) {
            toolCalls = functionCalls.map(tc => ({
                function: {
                    name: tc.name as string,
                    arguments: tc.args || {},
                },
            }));
        }

        return Message.new({
            model: model.name,
            name: '',
            role: 'assistant',
            content: text || '',
            toolCalls,
        });
    }

    async models(): Promise<Model[]> {
        return (
            await this.client.models.list({ 
                config: { httpOptions: { timeout: 1000 } } 
            })
        ).page.map(model => {
            const metadata = model;
            const name = metadata.name?.replace('models/', '') as string;

            return Model.new({
                id: `gemini:${name}`,
                name,
                metadata,
                engineId: this.options.engineId,
                supportsTools: true,
            });
        });
    }

    async info(model: string): Promise<Model> {
        const { name, displayName, ...metadata } = await this.client.models.get({ 
            model 
        });

        return Model.new({
            id: `gemini:${name}`,
            name: displayName as string,
            metadata,
            engineId: this.options.engineId,
            supportsTools: true,
        });
    }

    async connected(): Promise<boolean> {
        try {
            await this.client.models.list();
            return true;
        } catch {
            return false;
        }
    }
}
```

### 3.3 Ollama Client
**File**: `/home/user/tome/src/lib/engines/ollama/client.ts`

```typescript
import { Ollama as OllamaClient } from 'ollama/browser';

export default class Ollama implements Client {
    private options: ClientProps;
    private client: OllamaClient;

    message = OllamaMessage;
    modelRole = 'assistant' as Role;
    toolRole = 'tool' as Role;

    constructor(options: ClientProps) {
        this.options = options;
        this.client = new OllamaClient({
            host: options.url,
            fetch,
        });
    }

    async chat(
        model: Model,
        history: Message[],
        tools: Tool[] = [],
        options: Options = {}
    ): Promise<Message> {
        const messages = history.map(m => this.message.from(m));
        
        const response = await this.client.chat({
            model: model.name,
            messages,
            tools,
            options,
            stream: false,  // Non-streaming
        });

        // Extract thinking and content
        let thought: string | undefined;
        let content: string = response.message.content
            .replace(/\.$/, '')
            .replace(/^"/, '')
            .replace(/"$/, '');

        if (content.includes('<think>')) {
            [thought, content] = content.split('</think>');
            thought = thought.replace('<think>', '').trim();
            content = content.trim();
        }

        return Message.new({
            model: model.name,
            role: this.modelRole,
            content,
            thought,  // Stored separately
            toolCalls: response.message.tool_calls || [],
        });
    }

    async models(): Promise<Model[]> {
        return await Promise.all(
            (await this.client.list()).models.map(
                async model => await this.info(model.name)
            )
        );
    }

    async info(name: string): Promise<Model> {
        const metadata = await this.client.show({ model: name });

        // @ts-expect-error - capabilities not in type definitions
        const capabilities = metadata.capabilities as string[];

        return Model.new({
            id: name,
            name,
            metadata,
            engineId: Number(this.options.engineId),
            supportsTools: capabilities.includes('tools'),
        });
    }

    async connected(): Promise<boolean> {
        try {
            return (await this.models()) && true;
        } catch {
            return false;
        }
    }
}
```

---

## 4. TOOL/MCP INTEGRATION

### 4.1 Tool Interface Definition
**File**: `/home/user/tome/src/lib/engines/types.ts`

```typescript
export interface Tool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            required: string[];
            properties: Record<string, Property>;
        };
    };
}

export interface Property {
    type: string;
    description: string;
}

export interface ToolCall {
    id?: string;
    type?: 'function';
    function: {
        name: string;
        arguments: {
            [key: string]: any;
        };
    };
}
```

### 4.2 Gemini Tool Conversion
**File**: `/home/user/tome/src/lib/engines/gemini/tool.ts`

Gemini requires tool definitions to use specific Type enums:

```typescript
import { type FunctionDeclaration, type ToolListUnion, Type } from '@google/genai';

function from(tools: Tool | Tool[]): ToolListUnion {
    return [
        {
            functionDeclarations: Array.isArray(tools) 
                ? fromMany(tools) 
                : [fromOne(tools)],
        },
    ];
}

function fromMany(tools: Tool[]): FunctionDeclaration[] {
    return tools.map(tool => fromOne(tool));
}

function fromOne(tool: Tool): FunctionDeclaration {
    const properties = Object.map(
        tool.function.parameters.properties,
        (name, prop) => [
            name,
            {
                ...prop,
                ...(prop.type && !prop.anyOf 
                    ? { type: toGeminiType(prop.type) } 
                    : {}
                ),
            },
        ]
    );

    return {
        ...tool.function,
        parameters: {
            ...tool.function.parameters,
            type: Type.OBJECT,
            properties,
        },
    } as FunctionDeclaration;
}

function toGeminiType(type: string): Type {
    return (
        {
            string: Type.STRING,
            number: Type.NUMBER,
            boolean: Type.BOOLEAN,
            integer: Type.INTEGER,
            array: Type.ARRAY,
            object: Type.OBJECT,
        }[type] || Type.STRING
    );
}
```

### 4.3 Tool Retrieval and Dispatch
**File**: `/home/user/tome/src/lib/mcp.ts`

```typescript
import type { Tool } from '$lib/engines/types';

export async function getMcpTools(sessionId: number): Promise<Tool[]> {
    return (await invoke<McpTool[]>('get_mcp_tools', { sessionId })).map(tool => {
        return {
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    required: tool.inputSchema.required,
                    properties: tool.inputSchema.properties,
                },
            },
        };
    });
}
```

### 4.4 Tool Execution Flow
**File**: `/home/user/tome/src/lib/dispatch.ts`

```typescript
export async function dispatch(
    session: Session, 
    model: Model, 
    prompt?: string
): Promise<Message> {
    const engine = Engine.find(Number(model.engineId));

    const options: Options = {
        num_ctx: session.config.contextWindow,
        temperature: session.config.temperature,
    };

    // Fetch tools from MCP servers
    const tools = await session.tools();

    // Send chat request
    const message = await engine.client.chat(
        model,
        session.messages,
        tools,  // Pass tools to the model
        options
    );

    // Handle tool calls if present
    if (message.toolCalls?.length) {
        for (const call of message.toolCalls) {
            // Generate IDs for engines that don't provide them
            call.id ||= uuid4();

            // Execute the tool via Tauri command
            const content: string = await invoke('call_mcp_tool', {
                sessionId: session.id,
                name: call.function.name,
                arguments: call.function.arguments,
            });

            // Save tool call and response
            await session.addMessage({
                role: 'assistant',
                content: '',
                toolCalls: [call],
            });

            await session.addMessage({
                role: 'tool',
                content,
                toolCallId: call.id,
            });

            // Recursive call to continue the conversation
            return await dispatch(session, model);
        }
    }

    // Save final response
    message.engineId = model.engineId;
    message.model = String(model.id);
    message.sessionId = session.id;
    await message.save();

    return message;
}
```

---

## 5. MODEL MANAGEMENT

### 5.1 Model Storage and Retrieval
**File**: `/home/user/tome/src/lib/models/model.svelte.ts`

```typescript
export default class Model extends BareModel() {
    id?: string = $state();
    name: string = $state('');
    supportsTools: boolean = $state(false);
    metadata: Metadata = $state({});
    engineId?: number = $state();

    get engine() {
        return Engine.find(Number(this.engineId));
    }

    static async sync() {
        // Sync models from all engines
        this.reset(Engine.all().flatMap(e => e.models));
        info(`[green]✔ models synced`);
    }

    static default() {
        return Model.find(Config.defaultModel) || Model.first();
    }
}
```

### 5.2 Engine Model Retrieval
**File**: `/home/user/tome/src/lib/models/engine.svelte.ts`

```typescript
const AVAILABLE_MODELS: Record<EngineType, 'all' | string[]> = {
    'openai-compat': 'all',
    ollama: 'all',
    openai: [
        'gpt-4o',
        'o4-mini',
        'gpt-4.5-preview',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-5'
    ],
    gemini: [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ],
};

protected static async fromSql(row: Row): Promise<Engine> {
    const engine = Engine.new({
        id: row.id,
        name: row.name,
        type: row.type as EngineType,
        options: JSON.parse(row.options),
        models: [],
    });

    if (engine.client && (await engine.client.connected())) {
        try {
            engine.models = (await engine.client.models())
                .filter(m =>
                    AVAILABLE_MODELS[engine.type] == 'all' ||
                    AVAILABLE_MODELS[engine.type].includes(m.name)
                )
                .sortBy('name');
        } catch {
            // noop - no models available
        }
    }

    return engine;
}
```

---

## 6. ENGINE TYPES & INTERFACES

### 6.1 Complete Type Definitions
**File**: `/home/user/tome/src/lib/engines/types.ts`

```typescript
// Client Interface (MUST implement)
export interface Client {
    chat(
        model: Model,
        history: TomeMessage[],
        tools?: Tool[],
        options?: Options
    ): Promise<TomeMessage>;
    models(): Promise<Model[]>;
    info(model: string): Promise<Model>;
    connected(): Promise<boolean>;
}

// Configuration
export interface ClientOptions {
    apiKey: string;
    url: string;
}

export interface ClientProps extends ClientOptions {
    engineId: number;
}

// Model invocation options
export interface Options {
    num_ctx?: number;
    temperature?: number;
}

// Message structure
export type Role =
    | 'system'
    | 'user'
    | 'assistant'
    | 'tool'
    | 'function'
    | 'developer'     // OpenAI
    | 'model';        // Gemini

export interface Message {
    role: Role;
    content: string;
    name?: string;
    tool_calls?: ToolCall[];
}

// Tool definitions
export interface Tool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            required: string[];
            properties: Record<string, Property>;
        };
    };
}

export interface Property {
    type: string;
    description: string;
}

// Tool execution
export interface ToolCall {
    id?: string;
    type?: 'function';
    function: {
        name: string;
        arguments: {
            [key: string]: any;
        };
    };
}
```

---

## 7. CONFIGURATION & SETTINGS

### 7.1 Database Schema
**File**: `/home/user/tome/src-tauri/src/migrations.rs` (Migration 13)

```sql
CREATE TABLE IF NOT EXISTS engines (
    id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    options     JSON NOT NULL DEFAULT "{}"
);
```

Initial data insertion:

```sql
INSERT INTO engines ("name", "type", "options") VALUES
(
    "Ollama",
    "ollama",
    json_object('url', 'http://localhost:11434', 'apiKey', NULL)
),
(
    "OpenAI",
    "openai",
    json_object('url', 'https://api.openai.com/v1', 'apiKey', '<from-settings>')
),
(
    "Gemini",
    "gemini",
    json_object('url', 'https://generativelanguage.googleapis.com', 'apiKey', '<from-settings>')
);
```

### 7.2 Engine Model Class
**File**: `/home/user/tome/src/lib/models/engine.svelte.ts`

```typescript
export default class Engine extends Base<Row>('engines') {
    id?: number = $state();
    name: string = $state('');
    type: EngineType = $state('openai-compat');
    options: ClientOptions = $state({ url: '', apiKey: '' });
    models: Model[] = $state([]);

    get displayName() {
        return {
            ollama: 'Ollama',
            openai: 'OpenAI',
            gemini: 'Gemini',
            'openai-compat': 'OpenAI-Compatible Engine',
        }[this.type];
    }

    get client(): Client | undefined {
        const Client = {
            ollama: Ollama,
            openai: OpenAI,
            gemini: Gemini,
            'openai-compat': OpenAI,
        }[this.type];

        if (Client) {
            try {
                return new Client({ ...this.options, engineId: Number(this.id) });
            } catch {
                return undefined;
            }
        }
    }
}
```

### 7.3 Session Configuration
**File**: `/home/user/tome/src/lib/models/session.svelte.ts`

```typescript
interface Config {
    model: string;
    engineId: number;
    contextWindow: number;
    temperature: number;
    enabledMcpServers: string[];
}

export default class Session extends Base<Row>('sessions') {
    id?: number = $state();
    appId?: number = $state();
    config: Partial<Config> = $state({});
    ephemeral: boolean = $state(false);
    relay: boolean = $state(false);

    get default() {
        const model = Model.default();
        return {
            config: {
                model: model?.id,
                engineId: model?.engineId,
                contextWindow: 4096,
                temperature: 0.8,
            },
        };
    }
}
```

---

## 8. UI INTEGRATION

### 8.1 Onboarding Flow

The onboarding system allows users to configure engines:

#### OpenAI Onboarding
**File**: `/home/user/tome/src/routes/onboarding/models/openai/+page.svelte`

```svelte
<script lang="ts">
    import { Engine } from '$lib/models';

    let engine = $state(Engine.findBy({ type: 'openai' }) as Engine);
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

#### OpenAI-Compatible (Other) Onboarding
**File**: `/home/user/tome/src/routes/onboarding/models/other/+page.svelte`

```svelte
<script lang="ts">
    import { Engine } from '$lib/models';

    let engine = $state(Engine.new({ type: 'openai-compat' }));
    let valid = $state(false);

    function onkeyup() {
        valid = engine.name !== '' && engine.options?.url !== '';
    }
</script>

<Layout>
    <Modal {engine} disabled={!valid}>
        <LabeledSection icon="Text" title="Name">
            <Input {onkeyup} bind:value={engine.name} required placeholder="Name" />
        </LabeledSection>

        <LabeledSection icon="Url" title="URL">
            <Input {onkeyup} bind:value={engine.options.url} required placeholder="URL" />
        </LabeledSection>

        <LabeledSection icon="Key" title="API Key" class="border-none">
            <Input
                {onkeyup}
                bind:value={engine.options.apiKey}
                type="password"
                placeholder="API Key"
            />
        </LabeledSection>
    </Modal>
</Layout>
```

#### Modal Component
**File**: `/home/user/tome/src/components/Onboarding/Modal.svelte`

```svelte
<script lang="ts">
    import { goto } from '$app/navigation';
    import { Engine } from '$lib/models';

    interface Props {
        engine: Engine;
        disabled: boolean;
    }

    const { children, engine, disabled }: Props = $props();
    let error = $state(false);

    async function connect() {
        error = false;

        if (await engine.client?.connected()) {
            await engine.save();
            await goto('/onboarding/mcp');
        } else {
            error = true;
        }
    }
</script>

<!-- Form with Connect button -->
<Button {disabled} onclick={connect}>Continue</Button>
```

### 8.2 Model Selection
**File**: `/home/user/tome/src/components/ModelSelect.svelte`

Displays models grouped by engine:

```svelte
<script lang="ts">
    import { Engine, Model } from '$lib/models';

    let { engines = Engine.all(), onselect, selected = Model.default() } = $props();

    async function select(e: Event, model: Model) {
        e.preventDefault();
        selected = model;
        await onselect?.(model);
        close();
    }
</script>

<!-- Dropdown showing engines and their models -->
{#each engines as engine (engine.id)}
    {#if engine.models.length}
        <Flex class="flex-col items-start">
            <p>{engine.name}</p>
            {#each engine.models as model (model.id)}
                <button onclick={async e => await select(e, model)}>
                    {model.name}
                </button>
            {/each}
        </Flex>
    {/if}
{/each}
```

### 8.3 Models Page
**File**: `/home/user/tome/src/routes/models/+page.svelte`

Displays all models and allows setting a default:

```svelte
<script lang="ts">
    import { Config, Engine, Model } from '$lib/models';

    const engines: Engine[] = Engine.all();

    function setDefault(model: Model) {
        Config.defaultModel = String(model.id);
    }

    onMount(async () => {
        await Engine.sync();
    });
</script>

<Layout>
    {#each engines as engine (engine.id)}
        <h2>{engine.name}</h2>
        {#each engine.models as model (model.id)}
            <Box class="flex-row items-center">
                <h3>{model.name}</h3>
                <button onclick={() => setDefault(model)}>
                    <Svg name="Star" title="Default Model" />
                </button>
            </Box>
        {/each}
    {/each}
</Layout>
```

### 8.4 Chat Page
**File**: `/home/user/tome/src/routes/chat/[session_id]/+page.svelte`

Handles chat interactions:

```svelte
<script lang="ts">
    import { Session, Model } from '$lib/models';

    const session: Session = $derived(Session.find(Number(page.params.session_id)));
    const model: Model | undefined = $derived(
        Model.findBy({
            id: session.config.model,
            engineId: session.config.engineId,
        })
    );

    async function modelDidUpdate(model: Model) {
        session.config.model = model.id;
        session.config.engineId = model.engineId;
        await session.save();
    }
</script>

<Chat {session} {model} />
```

---

## 9. COMPLETE REQUEST/RESPONSE FLOW

### 9.1 Step-by-Step Flow

1. **User sends message**
   - Component: `Chat.svelte`
   - Action: `dispatch(session, model, prompt)`

2. **Message preparation**
   - File: `dispatch.ts`
   - Action: Convert user input to Message
   - Store: Save in database

3. **Tool collection**
   - File: `mcp.ts`
   - Action: Get MCP tools via Tauri IPC
   - Transform: Convert to canonical Tool format

4. **Engine selection**
   - File: `engine.svelte.ts`
   - Action: Create appropriate Client instance
   - Based on: `model.engineId`

5. **Message conversion**
   - File: `{engine}/message.ts`
   - Action: Convert Tome Message to provider format
   - Example: Tome → OpenAI/Gemini/Ollama format

6. **Chat request**
   - File: `{engine}/client.ts`
   - Action: `client.chat(model, messages, tools, options)`
   - Provider API call

7. **Response parsing**
   - File: `{engine}/client.ts`
   - Action: Extract content, tool_calls, thinking
   - Return: Tome Message format

8. **Tool call handling**
   - File: `dispatch.ts`
   - Check: If message has `toolCalls`
   - Action: For each tool call:
     - Invoke: `call_mcp_tool` Tauri command
     - Save: Tool call message
     - Save: Tool response message
     - Recurse: `dispatch()` again

9. **Response saving**
   - File: `message.svelte.ts`
   - Action: Save final message to database
   - Trigger: `afterCreate()` hook for summarization

10. **UI update**
    - File: `Chat.svelte`
    - Action: Re-render with new message
    - Auto-scroll to bottom

---

## 10. IMPLEMENTING ANTHROPIC CLAUDE SUPPORT

### 10.1 File Structure to Create

```
src/lib/engines/anthropic/
├── client.ts           # Main Anthropic client implementation
└── message.ts          # Message conversion to Anthropic format
```

### 10.2 Database Changes

Add migration to insert Anthropic engine:

```sql
-- Migration (add after existing)
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
```

### 10.3 Engine Type Registration

Update `src/lib/models/engine.svelte.ts`:

```typescript
type EngineType = 'ollama' | 'openai' | 'gemini' | 'anthropic' | 'openai-compat';

const AVAILABLE_MODELS: Record<EngineType, 'all' | string[]> = {
    'anthropic': [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20250219',
        // ... add Claude models
    ],
    // ... other engines
};

get client(): Client | undefined {
    const Client = {
        anthropic: Anthropic,  // ADD THIS
        ollama: Ollama,
        openai: OpenAI,
        gemini: Gemini,
        'openai-compat': OpenAI,
    }[this.type];
    // ...
}

get displayName() {
    return {
        anthropic: 'Anthropic',  // ADD THIS
        ollama: 'Ollama',
        // ... etc
    }[this.type];
}
```

### 10.4 Onboarding Page

Create `src/routes/onboarding/models/anthropic/+page.svelte`:

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

### 10.5 Implementation Checklist

- [ ] Create `/src/lib/engines/anthropic/client.ts` implementing `Client` interface
- [ ] Create `/src/lib/engines/anthropic/message.ts` for message conversion
- [ ] Handle Claude-specific features:
  - [ ] Thinking tokens (if using extended thinking)
  - [ ] Tool use format (differs from OpenAI)
  - [ ] Stop sequences for tool calls
- [ ] Update `engine.svelte.ts` with type and client mapping
- [ ] Create migration for Anthropic engine
- [ ] Create onboarding page
- [ ] Add Anthropic to model filtering
- [ ] Test with tool calls
- [ ] Test model listing and info retrieval
- [ ] Test connection validation

### 10.6 Key Implementation Patterns

**Message Conversion** (Anthropic format):
- System prompt separate from messages
- `role: 'user' | 'assistant'`
- Tool use format: content contains `ToolUseBlock`
- Tool results: special format with tool_use_id

**Tool Handling**:
- Anthropic returns `tool_use` in content
- Stop reason: `tool_use` or `end_turn`
- Tool results sent as `user` role with `ToolResultBlock`

**Model Listing**:
- Check if API provides model listing
- May need hardcoded list
- Each Claude model returned with metadata

**Connection Validation**:
- Simple models list call
- Or specific models.get() call
- Handle 401 auth errors

---

## 11. CRITICAL PATTERNS & GOTCHAS

### 11.1 Message History Management

⚠️ **Gemini System Messages**
- System messages are NOT included in the message history
- They're passed separately as `systemInstruction`
- `message.ts` returns `undefined` for system role
- Combined in `client.ts` before sending

```typescript
// WRONG - will break Gemini
const messages = history.map(m => GeminiMessage.from(m));

// CORRECT
const systemMessages = history.filter(m => m.role === 'system');
const nonSystemMessages = history.filter(m => m.role !== 'system');
const messages = nonSystemMessages.map(m => GeminiMessage.from(m)).compact();
```

### 11.2 Tool Call Identification

⚠️ **Missing Tool IDs**
- Ollama doesn't provide tool call IDs
- Must be generated on demand
- Uses `uuid4()` for uniqueness
- Prevents errors when recursing through dispatch

```typescript
// In dispatch.ts
call.id ||= uuid4();
```

### 11.3 Streaming vs Non-Streaming

⚠️ **Currently Non-Streaming**
- All implementations use non-streaming
- OpenAI: `ChatCompletionCreateParamsNonStreaming`
- Ollama: `stream: false`
- No streaming UI currently implemented

### 11.4 Temperature & Context Options

⚠️ **Inconsistent Option Support**
- OpenAI: ignores `num_ctx` and `temperature`
- Gemini: uses `temperature`
- Ollama: uses both
- Options passed but not always used by all engines

### 11.5 Thinking/Reasoning Content

⚠️ **Ollama-Specific**
- Ollama extracts thinking from `<think>` tags
- Stored separately in `message.thought`
- OpenAI may use different format (extended thinking)
- Gemini may use different format

### 11.6 Tool Format Differences

⚠️ **Gemini Requires Type Conversion**
```typescript
// Gemini needs this
type: Type.OBJECT  // Not string 'object'
properties: { ... }  // Must use Type enum values
```

⚠️ **OpenAI Direct Pass-Through**
```typescript
// OpenAI accepts tools directly
completion.tools = tools;
```

### 11.7 Model ID Formatting

⚠️ **ID Namespace**
- OpenAI: `openai:gpt-4o`
- Gemini: `gemini:gemini-2.5-pro`
- Ollama: Just model name
- Used for finding engine when loading model

### 11.8 Metadata Storage

⚠️ **Arbitrary Metadata**
```typescript
// Engines store raw provider metadata
metadata: {
    [key: string]: any;
}
```
- Different per provider
- Used for display (format, parameter_size for Ollama)
- Not validated or normalized

---

## 12. KEY FILES REFERENCE

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/engines/types.ts` | Central type definitions | 73 |
| `src/lib/engines/openai/client.ts` | OpenAI implementation | 105 |
| `src/lib/engines/openai/message.ts` | OpenAI message conversion | 65 |
| `src/lib/engines/gemini/client.ts` | Gemini implementation | 115 |
| `src/lib/engines/gemini/message.ts` | Gemini message conversion | 96 |
| `src/lib/engines/gemini/tool.ts` | Gemini tool conversion | 73 |
| `src/lib/engines/ollama/client.ts` | Ollama implementation | 90 |
| `src/lib/engines/ollama/message.ts` | Ollama message conversion | 21 |
| `src/lib/models/engine.svelte.ts` | Engine model & instantiation | 108 |
| `src/lib/models/model.svelte.ts` | Model model | 29 |
| `src/lib/models/message.svelte.ts` | Message model & storage | 81 |
| `src/lib/models/session.svelte.ts` | Session configuration | 170 |
| `src/lib/dispatch.ts` | Chat dispatch & tool handling | 84 |
| `src/lib/mcp.ts` | Tool retrieval | 26 |
| `src-tauri/src/migrations.rs` | Database schema | 1000+ |
| `src/routes/onboarding/models/*/+page.svelte` | Engine setup UI | ~30 each |
| `src/routes/chat/[session_id]/+page.svelte` | Chat interface | 150+ |
| `src/components/Chat.svelte` | Chat component | 150+ |
| `src/components/ModelSelect.svelte` | Model dropdown | 128 |

---

## 13. TESTING CHECKLIST

Before submitting Anthropic implementation:

- [ ] Engine instantiation works
- [ ] `connected()` validates API key
- [ ] `models()` returns list of Claude models
- [ ] `info()` returns specific model info
- [ ] Simple text chat works
- [ ] Tool call detection works
- [ ] Tool execution and recursion works
- [ ] System messages handled correctly
- [ ] Temperature parameter respected
- [ ] Context window parameter respected
- [ ] Onboarding page loads
- [ ] Engine configuration saves
- [ ] Model appears in dropdown
- [ ] Can select Claude model for chat
- [ ] Chat sends to Anthropic API
- [ ] Response displays in UI
- [ ] Tool calls execute and recurse correctly

---

## 14. EXPECTED IMPLEMENTATION TIME

- **Anthropic Client**: 2-3 hours
- **Message Conversion**: 1-2 hours
- **Database/Model Updates**: 30 minutes
- **Onboarding UI**: 1 hour
- **Testing**: 1-2 hours

**Total: 5-8 hours for complete integration**

