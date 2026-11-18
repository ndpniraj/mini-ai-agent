import Anthropic from "@anthropic-ai/sdk";

export type AgentTool = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  fun: (args: any) => Promise<string>;
};
