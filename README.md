# Mini Coding Agent

A small coding agent you can talk to from the terminal, written in TypeScript. You chat with it, and it can **read, create, edit and list files** in the folder you run it from. It does this with a simple loop:

```
You type a message
   → the model replies with text and/or "tool calls"
   → the agent runs those tools (read_file, edit_file, ...)
   → the tool results go back to the model
   → repeat until the model stops asking for tools
```

The project uses the **Anthropic SDK** (`@anthropic-ai/sdk`) and points it at **DeepSeek's Anthropic-compatible API** by default. This README also shows how to run it with:

- [A real Anthropic (Claude) API key](#option-1-anthropic-claude-with-a-real-api-key)
- [OpenAI](#option-2-openai)
- [Google Gemini](#option-3-google-gemini)
- [Local models (Ollama, LM Studio, llama.cpp, vLLM)](#option-4-local-models)

---

## Project structure

```
src/
├── main.ts                     # Entry point: reads your input, starts the agent
├── client.ts                   # Creates the API client (provider-specific)
├── agent.ts                    # The agent loop + model call (provider-specific)
├── tools/
│   ├── index.ts                # List of tools given to the model
│   └── fileHandlerTools.ts     # read_file, create_file, write_file, list_files, edit_file
├── types/
│   └── tools.ts                # AgentTool type (name, description, JSON schema, function)
└── smoke.ts                    # Small script to test that your API key works
```

## Quick start (DeepSeek, the default)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```bash
   DEEPSEEK_API_KEY=your-deepseek-key
   ```

   `.env` is already in `.gitignore`, so it won't be committed. Never commit API keys.

3. Run the agent:

   ```bash
   npm run dev
   ```

4. Try asking it to do something, for example:

   ```
   You: create a folder called demo and put a hello.ts file in it that prints "hello"
   ```

> The agent can create and change files in the folder you run it from. Run it in a project you don't mind it editing, or in an empty folder.

---

## What changes when you switch providers?

Most of the project **does not change**. The tools in `src/tools/` are plain TypeScript functions, and their `input_schema` is ordinary [JSON Schema](https://json-schema.org/), which every provider understands.

Each provider has its own **wire format**, though. These are the parts that differ:

| What                    | Anthropic / DeepSeek (current)          | OpenAI (Chat Completions)                         | Gemini                                              |
| ----------------------- | --------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| SDK package             | `@anthropic-ai/sdk`                     | `openai`                                          | `@google/genai`                                     |
| Tool definition         | `{ name, description, input_schema }`   | `{ type: "function", function: { name, description, parameters } }` | `{ functionDeclarations: [{ name, description, parametersJsonSchema }] }` |
| Model wants a tool      | `content` block with `type: "tool_use"` | `message.tool_calls[]` (arguments are a **JSON string**) | `part.functionCall` (args are an object)            |
| Sending tool results    | one `user` message with `tool_result` blocks | one `role: "tool"` message **per** tool call  | one `user` turn with `functionResponse` parts       |
| "Ran out of tokens"     | `stop_reason === "max_tokens"`          | `finish_reason === "length"`                      | `finishReason === FinishReason.MAX_TOKENS`          |
| Message history type    | `Anthropic.MessageParam[]`              | `ChatCompletionMessageParam[]`                    | `Content[]`                                         |

So when you switch providers, you only touch:

1. **`src/client.ts`**: how the client is created (API key, base URL).
2. **`src/agent.ts`**: `runModel()` (how tools are sent) and `run()` / `executeTool()` (how replies and tool results are read and sent back).
3. **`src/main.ts`**: only the imports, if you keep each provider in its own file (recommended below).

**Tip:** don't overwrite the original files. Add new files like `client.openai.ts` and `agent.openai.ts` next to them and switch the imports in `main.ts`. That way you can go back to DeepSeek at any time.

---

## Option 1: Anthropic (Claude) with a real API key

The code already uses Anthropic's format, so this is the smallest change. **You only edit the client and the model name.**

1. Get a key from the [Claude Console](https://console.anthropic.com/) and add it to `.env`:

   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. In `src/client.ts`, remove the DeepSeek `baseURL` and use your Anthropic key:

   ```ts
   import Anthropic from "@anthropic-ai/sdk";

   export const client = new Anthropic({
     apiKey: process.env.ANTHROPIC_API_KEY, // optional: the SDK reads this env var by default
   });
   ```

3. In `src/agent.ts`, inside `runModel()`, change the model name:

   ```ts
   return await this.client.messages.create({
     max_tokens: 4000,
     model: "claude-sonnet-5-5", // or "claude-opus-5-5" (smartest) / "claude-haiku-5-5" (fastest, cheapest)
     messages,
     tools,
     thinking: { type: "disabled" },
   });
   ```

That's all. `run()`, `executeTool()` and the tools stay as they are.

Notes:

- See the [models overview](https://docs.claude.com/en/docs/about-claude/models/overview) for the current list of model IDs.
- If you later turn on extended thinking, the loop already pushes `result.content` back into the history as-is, so the thinking blocks are kept correctly. Check the docs for the right `thinking` settings for your model.

---

## Option 2: OpenAI

1. Install nothing extra. `openai` is already in `package.json`.

2. Add your key to `.env`:

   ```bash
   OPENAI_API_KEY=sk-...
   # optional: choose a model without editing code
   OPENAI_MODEL=gpt-5.5
   ```

3. Create **`src/client.openai.ts`**:

   ```ts
   import OpenAI from "openai";

   export const client = new OpenAI({
     apiKey: process.env.OPENAI_API_KEY,
   });
   ```

4. Create **`src/agent.openai.ts`**. It's the same loop as `agent.ts`, rewritten for OpenAI's message format:

   ```ts
   import OpenAI from "openai";
   import { AgentTool } from "./types/tools";

   type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

   // Pick any current tool-calling model: https://platform.openai.com/docs/models
   const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";

   class Agent {
     constructor(
       private client: OpenAI,
       private userMessage: () => Promise<string>,
       private displayMessage: (message: string) => void,
       private tools: AgentTool[],
     ) {}

     async run() {
       const conversation: ChatMessage[] = [];
       let readUserInput = true;

       while (true) {
         if (readUserInput) {
           conversation.push({ role: "user", content: await this.userMessage() });
         }

         const result = await this.runModel(conversation);
         const choice = result.choices[0];
         const message = choice.message;

         // Save the assistant turn (text + tool_calls) in the history.
         conversation.push(message);

         if (choice.finish_reason === "length") {
           console.log("You hit the token limit, increase it to continue.");
           break;
         }

         if (message.content) this.displayMessage(message.content);

         const toolCalls = message.tool_calls ?? [];
         if (toolCalls.length === 0) {
           readUserInput = true;
           continue;
         }

         // OpenAI wants ONE "tool" message per tool call.
         for (const call of toolCalls) {
           if (call.type !== "function") continue;
           const content = await this.executeTool(
             call.function.name,
             call.function.arguments, // a JSON *string*, not an object
           );
           conversation.push({ role: "tool", tool_call_id: call.id, content });
         }

         readUserInput = false;
       }
     }

     async executeTool(name: string, rawArgs: string): Promise<string> {
       const tool = this.tools.find((t) => t.name === name);
       if (!tool) return `Error: tool not found: ${name}`;

       this.displayMessage(`${name}(${rawArgs})`);

       try {
         const input = JSON.parse(rawArgs || "{}");
         return await tool.fun(input);
       } catch (error) {
         return `Error: ${error instanceof Error ? error.message : String(error)}`;
       }
     }

     async runModel(messages: ChatMessage[]) {
       const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = this.tools.map(
         (t) => ({
           type: "function",
           function: {
             name: t.name,
             description: t.description,
             parameters: t.input_schema, // same JSON Schema, different key
           },
         }),
       );

       return await this.client.chat.completions.create({
         model: MODEL,
         messages,
         tools,
         max_completion_tokens: 4000,
       });
     }
   }

   export default Agent;
   ```

5. In **`src/main.ts`**, switch the two imports:

   ```ts
   import Agent from "./agent.openai";
   import { client } from "./client.openai";
   ```

6. Run `npm run dev`.

Notes:

- OpenAI has no `is_error` flag on tool results. We put `"Error: ..."` in the text instead, and the model understands it.
- If a model has no `max_completion_tokens` support, or you get errors about it, remove that line or use `max_tokens`.
- This example uses the **Chat Completions API** because many other providers and local servers copy it (see Option 4). OpenAI also has a newer **Responses API** (`client.responses.create`). The loop works the same way there, but the message shapes are different.
- DeepSeek has an OpenAI-compatible endpoint too (see `src/smoke.ts`), so the same code works with DeepSeek if you set `baseURL: "https://api.deepseek.com"` and use your DeepSeek key.

---

## Option 3: Google Gemini

1. Install Google's SDK:

   ```bash
   npm install @google/genai
   ```

2. Get a key from [Google AI Studio](https://aistudio.google.com/apikey) and add it to `.env`:

   ```bash
   GEMINI_API_KEY=...
   # optional: choose a model without editing code
   GEMINI_MODEL=gemini-2.5-flash
   ```

3. Create **`src/client.gemini.ts`**:

   ```ts
   import { GoogleGenAI } from "@google/genai";

   export const client = new GoogleGenAI({
     apiKey: process.env.GEMINI_API_KEY,
   });
   ```

4. Create **`src/agent.gemini.ts`**:

   ```ts
   import {
     GoogleGenAI,
     Content,
     FinishReason,
     FunctionDeclaration,
     Part,
   } from "@google/genai";
   import { AgentTool } from "./types/tools";

   // Pick any current tool-calling model: https://ai.google.dev/gemini-api/docs/models
   const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

   class Agent {
     constructor(
       private client: GoogleGenAI,
       private userMessage: () => Promise<string>,
       private displayMessage: (message: string) => void,
       private tools: AgentTool[],
     ) {}

     async run() {
       const conversation: Content[] = [];
       let readUserInput = true;

       while (true) {
         if (readUserInput) {
           conversation.push({
             role: "user",
             parts: [{ text: await this.userMessage() }],
           });
         }

         const result = await this.runModel(conversation);
         const candidate = result.candidates?.[0];

         if (!candidate?.content) {
           this.displayMessage(
             `(empty response, finishReason: ${candidate?.finishReason})`,
           );
           readUserInput = true;
           continue;
         }

         // Push the model's Content back AS-IS. This keeps hidden
         // "thought signatures" that newer Gemini models require.
         conversation.push(candidate.content);

         if (candidate.finishReason === FinishReason.MAX_TOKENS) {
           console.log("You hit the token limit, increase it to continue.");
           break;
         }

         const toolResponses: Part[] = [];

         for (const part of candidate.content.parts ?? []) {
           if (part.text && !part.thought) this.displayMessage(part.text);

           if (part.functionCall) {
             const { id, name = "", args = {} } = part.functionCall;
             const response = await this.executeTool(name, args);
             toolResponses.push({ functionResponse: { id, name, response } });
           }
         }

         if (toolResponses.length === 0) {
           readUserInput = true;
           continue;
         }

         // Tool results go back as a "user" turn made of functionResponse parts.
         readUserInput = false;
         conversation.push({ role: "user", parts: toolResponses });
       }
     }

     async executeTool(
       name: string,
       input: Record<string, unknown>,
     ): Promise<Record<string, unknown>> {
       const tool = this.tools.find((t) => t.name === name);
       if (!tool) return { error: `tool not found: ${name}` };

       this.displayMessage(`${name}(${JSON.stringify(input)})`);

       try {
         return { output: await tool.fun(input) };
       } catch (error) {
         return { error: error instanceof Error ? error.message : String(error) };
       }
     }

     async runModel(contents: Content[]) {
       const functionDeclarations: FunctionDeclaration[] = this.tools.map((t) => ({
         name: t.name,
         description: t.description,
         parametersJsonSchema: t.input_schema, // plain JSON Schema works here
       }));

       return await this.client.models.generateContent({
         model: MODEL,
         contents,
         config: {
           tools: [{ functionDeclarations }],
           maxOutputTokens: 8000,
         },
       });
     }
   }

   export default Agent;
   ```

5. In **`src/main.ts`**, switch the two imports:

   ```ts
   import Agent from "./agent.gemini";
   import { client } from "./client.gemini";
   ```

6. Run `npm run dev`.

Notes:

- Gemini expects tool results as an **object**, not a string. We send `{ output: "..." }` on success and `{ error: "..." }` on failure.
- Use `parametersJsonSchema` (not `parameters`) so you can pass the existing JSON Schema without converting it to Gemini's own schema format.
- On "thinking" Gemini models, thinking tokens count toward `maxOutputTokens`. If replies get cut off, raise it.
- Model names change often. If `gemini-2.5-flash` isn't available anymore, pick a current model from the [models page](https://ai.google.dev/gemini-api/docs/models).

---

## Option 4: Local models

Most local model runners provide an **OpenAI-compatible API**. So you can **reuse the OpenAI code from Option 2** and only change the client's `baseURL` and the model name:

```ts
// src/client.local.ts
import OpenAI from "openai";

export const client = new OpenAI({
  baseURL: "http://localhost:11434/v1", // Ollama, see the table below
  apiKey: "not-needed", // local servers usually ignore it, but the SDK needs a value
});
```

Then set the model to the one you downloaded, for example `OPENAI_MODEL=qwen3` in `.env`.

| Tool          | Default OpenAI-compatible URL      | Model name looks like       |
| ------------- | ---------------------------------- | --------------------------- |
| Ollama        | `http://localhost:11434/v1`        | whatever you `ollama pull`ed |
| LM Studio     | `http://localhost:1234/v1`         | name shown in LM Studio     |
| llama.cpp     | `http://localhost:8080/v1`         | mostly ignored (one model)  |
| vLLM          | `http://localhost:8000/v1`         | the Hugging Face model ID   |

Hints for local models:

- **Pick a model that supports tool calling.** This agent can only do useful work through tools. Look for models tagged "tools" or "function calling" (for example recent Qwen, Llama, Mistral or DeepSeek models). If a model doesn't support tools, it will only chat and never touch your files.
- **Bigger is better for agents.** Very small models (1–3B) often call tools with wrong arguments or loop forever. 7B+ works for simple tasks; 14B–32B+ is much more reliable.
- **Raise the context size.** The whole conversation, including file contents, is sent each turn. Ollama's default context window is small; increase it (for example the `num_ctx` setting) if the model starts "forgetting".
- **Token limit parameter:** some local servers don't accept `max_completion_tokens`. If you get an error, change it to `max_tokens` or remove it.
- **Anthropic-compatible local servers:** some runners (recent Ollama versions, for example) also provide an Anthropic-compatible endpoint. If yours does, you can keep the **original** `agent.ts` and only change `baseURL` in `src/client.ts`, just like this project does for DeepSeek. Check your runner's docs for the exact URL.

---

## Making `types/tools.ts` provider-neutral (optional)

`src/types/tools.ts` uses `Anthropic.Tool.InputSchema` as the schema type. This still works with every option above, as long as `@anthropic-ai/sdk` stays installed. If you remove the Anthropic SDK completely, replace the type with a plain JSON Schema type:

```ts
export type AgentTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  fun: (args: any) => Promise<string>;
};
```

---

## Troubleshooting

| Problem | Likely cause / fix |
| --- | --- |
| `401` / `Unauthorized` | Wrong or missing API key. Check the variable name in `.env` matches the one in your client file. `npm run dev` loads `.env` automatically. |
| `404` / "model not found" | The model name is wrong or no longer available. Check the provider's models page. |
| The model only chats and never uses tools | The model doesn't support tool calling (common with small local models), or the tools weren't passed in `runModel()`. |
| Error about tool results / tool call IDs | Every tool call must get exactly one result with the matching ID (`tool_use_id` for Anthropic, `tool_call_id` for OpenAI, `id` + `name` for Gemini). |
| Replies are cut off | Raise `max_tokens` / `max_completion_tokens` / `maxOutputTokens`. |

To see exactly what is sent to the API, uncomment the `fetch: logFetch` line in `src/client.ts`. The OpenAI SDK accepts the same `fetch` option.
