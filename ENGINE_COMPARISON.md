# TOME ENGINE IMPLEMENTATIONS - SIDE-BY-SIDE COMPARISON

## Quick Feature Comparison

| Feature | OpenAI | Gemini | Ollama | Anthropic |
|---------|--------|--------|--------|-----------|
| **Auth** | API Key | API Key | None | API Key |
| **Base URL** | Configurable | Fixed | Configurable | Configurable |
| **System Messages** | Included in history | Separate instruction | Included | ? |
| **Tool Calls** | `tool_calls` array | `functionCalls` object | `tool_calls` | `tool_use` blocks |
| **Thinking** | Not shown | Not shown | `<think>` tags | Content blocks |
| **Model Listing** | API supported | API supported | API supported | Hardcoded/API? |
| **Streaming** | Supported (not used) | Supported (not used) | Supported (not used) | ? |
| **Context Window** | Parameter ignored | Parameter ignored | Parameter used | ? |
| **Temperature** | Parameter ignored | Parameter used | Parameter used | ? |

---

## Message Formatting Comparison

### System Message Handling

**OpenAI** - Included in message history
```typescript
{
    role: 'system',
    content: 'You are a helpful assistant',
}
```

**Gemini** - Separate systemInstruction
```typescript
config.systemInstruction = {
    parts: [{ text: 'You are a helpful assistant' }],
};
```

**Ollama** - Included in message history
```typescript
{
    role: 'system',
    content: 'You are a helpful assistant',
}
```

**Anthropic** - Likely separate or in first message
(Need to verify implementation)

### User Message Handling

**OpenAI**
```typescript
{
    role: 'user',
    content: 'Hello, how are you?',
}
```

**Gemini**
```typescript
{
    role: 'user',
    parts: [{ text: 'Hello, how are you?' }],
}
```

**Ollama**
```typescript
{
    role: 'user',
    content: 'Hello, how are you?',
}
```

**Anthropic**
```typescript
{
    role: 'user',
    content: 'Hello, how are you?' | ContentBlock[],
}
```

### Assistant Response with Text

**OpenAI**
```typescript
{
    role: 'assistant',
    content: 'I am doing well, thank you!',
    tool_calls: undefined,
}
```

**Gemini**
```typescript
{
    role: 'model',
    parts: [{ text: 'I am doing well, thank you!' }],
}
```

**Ollama**
```typescript
{
    role: 'assistant',
    content: 'I am doing well, thank you!',
    tool_calls: undefined,
}
```

**Anthropic**
```typescript
{
    role: 'assistant',
    content: [
        { type: 'text', text: 'I am doing well, thank you!' }
    ],
}
```

### Tool Call Representation

**OpenAI**
```typescript
{
    role: 'assistant',
    content: '',
    tool_calls: [
        {
            id: 'call_123',
            type: 'function',
            function: {
                name: 'get_weather',
                arguments: '{"location": "NYC"}',
            },
        }
    ],
}
```

**Gemini** (when ONLY tool call, no text)
```typescript
{
    role: 'model',
    parts: [
        {
            functionCall: {
                id: 'call_123',
                name: 'get_weather',
                args: { location: 'NYC' },
            },
        }
    ],
}
```

**Ollama**
```typescript
{
    role: 'assistant',
    content: '',
    tool_calls: [
        {
            function: {
                name: 'get_weather',
                arguments: { location: 'NYC' },
            },
        }
    ],
}
```

**Anthropic**
```typescript
{
    role: 'assistant',
    content: [
        {
            type: 'tool_use',
            id: 'tool_123',
            name: 'get_weather',
            input: { location: 'NYC' },
        }
    ],
}
```

### Tool Response (Result of Tool Call)

**OpenAI**
```typescript
{
    tool_call_id: 'call_123',
    role: 'tool',
    content: '{"temperature": 72, "condition": "sunny"}',
}
```

**Gemini**
```typescript
{
    role: 'user',
    parts: [
        {
            functionResponse: {
                name: 'get_weather',
                response: {
                    result: '{"temperature": 72, "condition": "sunny"}',
                },
            },
        }
    ],
}
```

**Ollama**
```typescript
{
    role: 'tool',
    content: '{"temperature": 72, "condition": "sunny"}',
    tool_calls: undefined,
}
```

**Anthropic**
```typescript
{
    role: 'user',
    content: [
        {
            type: 'tool_result',
            tool_use_id: 'tool_123',
            content: '{"temperature": 72, "condition": "sunny"}',
        }
    ],
}
```

---

## Tool Definition Conversion

### Canonical Tool Format (Tome Standard)

```typescript
{
    type: 'function',
    function: {
        name: 'get_weather',
        description: 'Get current weather',
        parameters: {
            type: 'object',
            required: ['location'],
            properties: {
                location: {
                    type: 'string',
                    description: 'City name',
                },
                unit: {
                    type: 'string',
                    description: 'Temperature unit (C or F)',
                },
            },
        },
    },
}
```

### OpenAI Conversion

Direct pass-through! No conversion needed.

```typescript
completion.tools = tools;  // Use directly
```

### Gemini Conversion

Requires Type enum conversion:

```typescript
{
    functionDeclarations: [
        {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
                type: Type.OBJECT,
                required: ['location'],
                properties: {
                    location: {
                        type: Type.STRING,
                        description: 'City name',
                    },
                    unit: {
                        type: Type.STRING,
                        description: 'Temperature unit',
                    },
                },
            },
        }
    ],
}
```

### Ollama Conversion

Direct pass-through with no conversion:

```typescript
response = await client.chat({
    tools,  // Use directly
});
```

### Anthropic Conversion

(Likely similar to OpenAI, verify needed)

```typescript
response = await client.messages.create({
    tools,  // Use directly or minimal conversion
});
```

---

## Client Implementation Patterns

### Constructor Pattern

**OpenAI & Anthropic**
```typescript
constructor(options: ClientProps) {
    this.options = options;
    this.client = new ProviderClient({
        apiKey: options.apiKey,
        baseURL: options.url,
        fetch,
        dangerouslyAllowBrowser: true,
    });
}
```

**Gemini**
```typescript
constructor(options: ClientProps) {
    this.options = options;
    this.client = new GoogleGenAI({
        apiKey: options.apiKey,
    });
    // URL is built-in, not configurable
}
```

**Ollama**
```typescript
constructor(options: ClientProps) {
    this.options = options;
    this.client = new OllamaClient({
        host: options.url,
        fetch,
    });
    // No API key needed
}
```

### Chat Method Pattern

**OpenAI**
```typescript
async chat(model: Model, history: Message[], tools?: Tool[], options?: Options) {
    const messages = history.map(m => OpenAiMessage.from(m));
    const completion = { model: model.name, messages };
    if (tools.length) completion.tools = tools;
    const response = await this.client.chat.completions.create(completion);
    return Message.new({...parseOpenAiResponse(response)});
}
```

**Gemini**
```typescript
async chat(model: Model, history: Message[], tools?: Tool[], options?: Options) {
    const systemMessages = history.filter(m => m.role === 'system');
    const messages = history.filter(m => m.role !== 'system')
        .map(m => GeminiMessage.from(m));
    const config = { temperature: options?.temperature };
    if (systemMessages.length) {
        config.systemInstruction = {parts: [{text: systemMessages.map(m => m.content).join('\n')}]};
    }
    if (tools?.length) config.tools = GeminiTools.from(tools);
    const response = await this.client.models.generateContent({
        model: model.name, contents: messages, config
    });
    return Message.new({...parseGeminiResponse(response)});
}
```

**Ollama**
```typescript
async chat(model: Model, history: Message[], tools?: Tool[], options?: Options) {
    const messages = history.map(m => this.message.from(m));
    const response = await this.client.chat({
        model: model.name,
        messages,
        tools,
        options,
        stream: false,
    });
    // Extract thinking and content
    return Message.new({...parseOllamaResponse(response)});
}
```

**Anthropic** (Expected Pattern)
```typescript
async chat(model: Model, history: Message[], tools?: Tool[], options?: Options) {
    const messages = history.map(m => AnthropicMessage.from(m));
    const response = await this.client.messages.create({
        model: model.name,
        messages,
        tools,
        max_tokens: 4096,
        temperature: options?.temperature,
    });
    // Extract content blocks and tool uses
    return Message.new({...parseAnthropicResponse(response)});
}
```

---

## Model Listing Approach

### OpenAI
```typescript
async models(): Promise<Model[]> {
    return (await this.client.models.list({ timeout: 1000 }))
        .data.map(model => {
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
```

### Gemini
```typescript
async models(): Promise<Model[]> {
    return (await this.client.models.list({
        config: { httpOptions: { timeout: 1000 } }
    }))
    .page.map(model => {
        const name = model.name?.replace('models/', '') as string;
        return Model.new({
            id: `gemini:${name}`,
            name,
            metadata: model,
            engineId: this.options.engineId,
            supportsTools: true,
        });
    });
}
```

### Ollama
```typescript
async models(): Promise<Model[]> {
    return await Promise.all(
        (await this.client.list()).models.map(
            async model => await this.info(model.name)
        )
    );
}

async info(name: string): Promise<Model> {
    const metadata = await this.client.show({ model: name });
    const capabilities = metadata.capabilities as string[];
    return Model.new({
        id: name,
        name,
        metadata,
        engineId: Number(this.options.engineId),
        supportsTools: capabilities.includes('tools'),
    });
}
```

### Anthropic (Recommended)
```typescript
async models(): Promise<Model[]> {
    const names = [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20250219',
    ];
    return names.map(name => Model.new({
        id: `anthropic:${name}`,
        name,
        engineId: this.options.engineId,
        supportsTools: true,
        metadata: {},
    }));
}

async info(name: string): Promise<Model> {
    return Model.new({
        id: `anthropic:${name}`,
        name,
        engineId: this.options.engineId,
        supportsTools: true,
        metadata: {},
    });
}
```

---

## Connection Validation Approach

### OpenAI
```typescript
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
```

### Gemini
```typescript
async connected(): Promise<boolean> {
    try {
        await this.client.models.list();
        return true;
    } catch {
        return false;
    }
}
```

### Ollama
```typescript
async connected(): Promise<boolean> {
    try {
        return (await this.models()) && true;
    } catch {
        return false;
    }
}
```

### Anthropic (Recommended)
```typescript
async connected(): Promise<boolean> {
    try {
        if (!this.options.apiKey) return false;
        // Make minimal request
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
```

---

## Key Takeaways for Anthropic Implementation

1. **System Messages**: Verify if separate parameter or in message history
2. **Tool Format**: Anthropic uses content blocks with `tool_use` type
3. **Tool Response**: Uses `tool_result` type in user message content
4. **Model Listing**: Start with hardcoded, add API support later if needed
5. **Max Tokens**: Required parameter, must always be set
6. **Stop Reason**: Indicates when to execute tools vs end conversation
7. **Content Blocks**: Unlike flat message format, uses block-based structure
8. **Error Handling**: Consistent with other providers (catch exceptions)

