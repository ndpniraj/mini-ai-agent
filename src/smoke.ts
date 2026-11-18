import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const logFetch = async (url: any, init: any) => {
  console.log(`Sent to ${url} with method: ${init?.method}`);
  console.log("body: ", JSON.stringify(init?.body, null, 2));
  const res = await fetch(url, init);

  console.log("Got status: ", res.status);

  return res;
};

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
  fetch: logFetch,
});

const antClient = new Anthropic({
  baseURL: "https://api.deepseek.com/anthropic",
  apiKey: process.env.DEEPSEEK_API_KEY,
  fetch: logFetch,
});

const main = async () => {
  const res = await client.chat.completions.create({
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "Hi, my name is Niraj." }],
  });

  //   const res = await antClient.messages.create({
  //     model: "deepseek-v4-pro",
  //     messages: [{ role: "user", content: "Hi, my name is Niraj." }],
  //     max_tokens: 100,
  //   });

  console.log(JSON.stringify(res, null, 2));
};

main();
