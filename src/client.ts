import Anthropic from "@anthropic-ai/sdk";

const logFetch = async (url: any, init: any) => {
  console.log(`Sent to ${url} with method: ${init?.method}`);
  console.log("body: ");
  console.log(JSON.stringify(JSON.parse(init?.body), null, 2));
  const res = await fetch(url, init);

  console.log("Got status: ", res.status);

  return res;
};

export const client = new Anthropic({
  baseURL: "https://api.deepseek.com/anthropic",
  apiKey: process.env.DEEPSEEK_API_KEY,
  //   fetch: logFetch,
});
