# TOME LLM ENGINE INTEGRATION ANALYSIS - COMPLETE INDEX

## Overview

This folder contains a **VERY THOROUGH analysis** of how LLM engine integrations work in the Tome project. Three comprehensive documents provide everything needed to implement Anthropic Claude support.

---

## Documents Included

### 1. ENGINE_ANALYSIS.md (42 KB, 1638 lines)
**The Complete Technical Reference**

Comprehensive 14-section guide covering:

1. **Engine Structure Analysis** (1.1-1.4)
   - Directory structure
   - Client interface definition
   - ClientOptions and runtime options

2. **Message Formatting** (2.1-2.4)
   - OpenAI message format with examples
   - Gemini message format with system message separation
   - Ollama message format with thinking content
   - Role type definitions

3. **Client Implementation** (3.1-3.3)
   - Full OpenAI client code (130+ lines)
   - Full Gemini client code with detailed comments
   - Full Ollama client code with thinking extraction
   - Constructor patterns, methods, error handling

4. **Tool/MCP Integration** (4.1-4.4)
   - Tool interface definitions
   - Gemini tool conversion with Type enums
   - Tool retrieval and dispatch flow
   - Complete dispatch.ts logic for tool execution

5. **Model Management** (5.1-5.2)
   - Model storage and retrieval
   - Engine model retrieval with filtering
   - AVAILABLE_MODELS configuration

6. **Engine Types & Interfaces** (6.1)
   - Complete Client interface
   - Message structure
   - ToolCall definition
   - Property schema

7. **Configuration & Settings** (7.1-7.3)
   - Database schema for engines table
   - Engine model class with client instantiation
   - Session configuration structure

8. **UI Integration** (8.1-8.4)
   - Onboarding flow for each engine
   - Model selection component
   - Models page
   - Chat page

9. **Complete Request/Response Flow** (9.1)
   - Step-by-step 10-step message flow
   - From user input to tool execution to response

10. **Implementing Anthropic Claude Support** (10.1-10.6)
    - File structure to create
    - Database migration needed
    - Engine type registration
    - Onboarding page template
    - Complete implementation checklist

11. **Critical Patterns & Gotchas** (11.1-11.8)
    - Gemini system message handling
    - Tool call ID generation
    - Streaming vs non-streaming
    - Temperature/context options inconsistency
    - Thinking content extraction
    - Tool format differences
    - Model ID formatting
    - Metadata storage

12. **Key Files Reference** (12)
    - Table of all critical files with line counts
    - Direct paths to reference implementations

13. **Testing Checklist** (13)
    - 14-point comprehensive test plan

14. **Expected Implementation Time** (14)
    - Breakdown: 5-8 hours total

**File**: `/home/user/tome/ENGINE_ANALYSIS.md`

---

### 2. ENGINE_QUICK_REFERENCE.md (9.4 KB, 360 lines)
**Fast Implementation Guide**

Quick-start guide for developers:

1. **Essential Checklist for Anthropic Implementation**
   - Create core files (client.ts, message.ts)
   - Register engine type
   - Create onboarding UI
   - Database migration

2. **Code Patterns to Follow**
   - Message formatting pattern template
   - Client pattern template
   - Ready-to-use code snippets

3. **Important Gotchas** (8 specific points)
   - System message handling
   - Tool format differences
   - Stop reason interpretation
   - Message structure with content blocks
   - Temperature ranges
   - Max tokens requirement

4. **Testing Flow** (10-step verification)

5. **Files to Reference**
   - List of critical files with line counts
   - Easy navigation

6. **Import Statements**
   - Ready-to-copy imports for client.ts
   - Engine.svelte.ts imports

7. **Package.json Addition**
   - SDK dependency template

8. **Key Decision Points** (5 critical decisions)
   - Model listing strategy
   - System message handling
   - Tool response format
   - Extended thinking support
   - Error handling approach

**File**: `/home/user/tome/ENGINE_QUICK_REFERENCE.md`

---

### 3. ENGINE_COMPARISON.md (8.4 KB, 400+ lines)
**Side-by-Side Implementation Reference**

Detailed comparison of all engine implementations:

1. **Quick Feature Comparison Table**
   - 8 features across 4 engines
   - Auth, URL, system messages, tool calls, thinking, model listing, streaming, parameters

2. **Message Formatting Comparison** (5 sections)
   - System message handling (OpenAI vs Gemini vs Ollama vs Anthropic)
   - User message handling
   - Assistant response with text
   - Tool call representation
   - Tool response format

3. **Tool Definition Conversion**
   - Canonical Tool format (Tome standard)
   - OpenAI conversion (direct pass-through)
   - Gemini conversion (Type enum required)
   - Ollama conversion (direct pass-through)
   - Anthropic conversion (likely minimal)

4. **Client Implementation Patterns**
   - Constructor patterns for each engine
   - Chat method patterns with pseudo-code
   - Model listing approaches
   - Connection validation strategies

5. **Key Takeaways for Anthropic**
   - 8 specific implementation considerations

**File**: `/home/user/tome/ENGINE_COMPARISON.md`

---

## How to Use These Documents

### For Quick Start (30-60 minutes)
1. Read ENGINE_QUICK_REFERENCE.md
2. Reference ENGINE_COMPARISON.md for specific patterns
3. Start implementing following the checklist

### For Deep Understanding (2-3 hours)
1. Read ENGINE_ANALYSIS.md sections 1-8
2. Read ENGINE_COMPARISON.md for visual comparisons
3. Reference actual files from the codebase

### For Implementation (4-6 hours)
1. Use ENGINE_QUICK_REFERENCE.md as checklist
2. Reference ENGINE_ANALYSIS.md sections 10-11 for gotchas
3. Reference ENGINE_COMPARISON.md for code patterns
4. Copy templates and customize for Anthropic

---

## Key Facts About Tome Engine Architecture

### Universal Interface
All engines must implement `Client` interface:
- `chat()` - Send message to model
- `models()` - List available models
- `info()` - Get model details
- `connected()` - Validate credentials

### Message Transformation
Each engine has provider-specific message formatting:
- OpenAI: Simple `{ role, content }` format
- Gemini: Complex `{ role, parts[] }` format with system instruction separation
- Ollama: Simple format with thinking extraction
- Anthropic: Content block format with tool_use elements

### Tool Integration
Consistent MCP tool flow across all engines:
1. Retrieve tools from MCP servers
2. Pass to model in chat request
3. Parse tool calls from response
4. Execute via Tauri command
5. Recurse with tool results

### Database Storage
Single engines table stores:
- Engine name (user-chosen)
- Engine type (openai, gemini, ollama, anthropic, etc.)
- Options JSON (apiKey, url)

Models synced from API or hardcoded list, associated with engine.

### Configuration
Session-level settings:
- Selected model
- Selected engine
- Context window (mostly ignored)
- Temperature (selectively used)
- Enabled MCP servers

### UI Flow
1. Onboarding: Configure engine credentials
2. Model selection: Choose from available models
3. Chat: Send messages, receive responses, execute tools
4. Settings: View all models, set default

---

## Critical Implementation Points

1. **System Messages**
   - Gemini: Separate `systemInstruction` parameter
   - Others: Included in message history
   - Anthropic: Verify in API docs

2. **Tool Calls**
   - OpenAI: `tool_calls` array
   - Gemini: `functionCalls` object
   - Ollama: `tool_calls` array
   - Anthropic: Content blocks with `tool_use` type

3. **Message Roles**
   - Standard: 'system', 'user', 'assistant', 'tool'
   - Gemini-specific: 'model' (not 'assistant')
   - OpenAI-specific: 'developer'

4. **Tool Response**
   - Different format for each provider
   - Must reconstruct tool call reference
   - Gemini requires lookup in session history

5. **Thinking Content**
   - Ollama: Extracted from `<think>` tags
   - Claude: Likely in content blocks
   - Store separately in `message.thought`

---

## File Locations Quick Reference

```
Core Interfaces:
  src/lib/engines/types.ts

OpenAI Implementation (as reference):
  src/lib/engines/openai/client.ts          # 105 lines
  src/lib/engines/openai/message.ts         # 65 lines

Gemini Implementation (complex example):
  src/lib/engines/gemini/client.ts          # 115 lines
  src/lib/engines/gemini/message.ts         # 96 lines
  src/lib/engines/gemini/tool.ts            # 73 lines

Ollama Implementation (simple example):
  src/lib/engines/ollama/client.ts          # 90 lines
  src/lib/engines/ollama/message.ts         # 21 lines

Model & Engine Management:
  src/lib/models/engine.svelte.ts           # 108 lines
  src/lib/models/model.svelte.ts            # 29 lines
  src/lib/models/message.svelte.ts          # 81 lines
  src/lib/models/session.svelte.ts          # 170 lines

Request Handling:
  src/lib/dispatch.ts                       # 84 lines
  src/lib/mcp.ts                            # 26 lines

UI:
  src/routes/onboarding/models/*/+page.svelte
  src/routes/chat/[session_id]/+page.svelte
  src/components/Chat.svelte
  src/components/ModelSelect.svelte

Database:
  src-tauri/src/migrations.rs               # ~2000 lines
```

---

## What Makes Tome's Architecture Elegant

1. **Plugin System**: Easy to add new providers
2. **Clear Contracts**: All engines implement same interface
3. **Modular Concerns**: Message formatting separate from client logic
4. **Flexibility**: Supports completely different message formats
5. **Tool Integration**: Seamless MCP tool execution regardless of provider
6. **Fallback Handling**: Graceful degradation for missing features
7. **Consistent UI**: Same UI works with all engines
8. **Easy Testing**: Can test each component independently

---

## Next Steps

1. Read ENGINE_QUICK_REFERENCE.md (20 minutes)
2. Skim ENGINE_COMPARISON.md for patterns (15 minutes)
3. Reference ENGINE_ANALYSIS.md while coding (ongoing)
4. Follow the implementation checklist
5. Test against all identified test cases
6. Submit PR with working Anthropic integration

---

## Document Statistics

| Document | Size | Lines | Sections |
|----------|------|-------|----------|
| ENGINE_ANALYSIS.md | 42 KB | 1638 | 14 major |
| ENGINE_QUICK_REFERENCE.md | 9.4 KB | 360 | 8 |
| ENGINE_COMPARISON.md | 8.4 KB | 400+ | 5 major |
| **TOTAL** | **59.8 KB** | **2400+** | **Complete** |

---

Generated: 2025-11-08
Coverage: Complete LLM engine integration architecture
Focus: Ready for Anthropic Claude implementation

