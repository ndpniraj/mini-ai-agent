import Anthropic from "@anthropic-ai/sdk";
import { AgentTool } from "./types/tools";

class Agent {
  constructor(
    private client: Anthropic,
    private userMessage: () => Promise<string>,
    private displayMessage: (message: string) => void,
    private tools: AgentTool[],
  ) {}

  async run() {
    const conversation: Anthropic.MessageParam[] = [];
    let readUserInput = true;

    while (true) {
      if (readUserInput) {
        const message: Anthropic.MessageParam = {
          role: "user",
          content: await this.userMessage(),
        };

        conversation.push(message);
      }

      const result = await this.runModel(conversation);
      conversation.push({ content: result.content, role: result.role });

      if (result.stop_reason === "max_tokens") {
        console.log("You hit the limit of max_tokens, increase to continue.");
        break;
      }
      console.log(JSON.stringify(result, null, 2));

      const toolResults: Anthropic.ContentBlockParam[] = [];

      for (const msg of result.content) {
        switch (msg.type) {
          case "text":
            this.displayMessage(msg.text);
            break;

          case "tool_use":
            const toolResult = await this.executeTool(
              msg.id,
              msg.name,
              msg.input,
            );
            toolResults.push(toolResult);
        }
      }

      if (toolResults.length === 0) {
        readUserInput = true;
        continue;
      }

      readUserInput = false;
      conversation.push({
        role: "user",
        content: toolResults,
      });
    }
  }

  async executeTool(
    id: string,
    name: string,
    input: any,
  ): Promise<Anthropic.ContentBlockParam> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool)
      return {
        tool_use_id: id,
        type: "tool_result",
        is_error: true,
        content: "tool not found",
      };

    this.displayMessage(`${name}(${JSON.stringify(input)})`);

    try {
      return {
        tool_use_id: id,
        type: "tool_result",
        content: await tool.fun(input),
      };
    } catch (error) {
      return {
        tool_use_id: id,
        type: "tool_result",
        is_error: true,
        content: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async runModel(messages: Anthropic.MessageParam[]) {
    const tools: Anthropic.ToolUnion[] = this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
    return await this.client.messages.create({
      max_tokens: 4000,
      model: "deepseek-v4-pro",
      messages,
      tools,
      thinking: {
        type: "disabled",
      },
    });
  }
}

export default Agent;
