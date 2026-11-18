import * as readline from "readline/promises";

import Agent from "./agent";
import { client } from "./client";
import tools from "./tools";

const main = () => {
  const agent = new Agent(client, getUserInput, logAIMessage, tools);
  agent.run();
};

const getUserInput = async (): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const userMessage = await rl.question("You: ");

  rl.close();

  return userMessage;
};

const logAIMessage = (msg: string) => {
  console.log("AI: ", msg);
};

main();
