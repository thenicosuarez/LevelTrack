import OpenAI from "openai";

export const openaiConfigured = () => !!process.env.OPENAI_API_KEY;

// Created on first use so the server can start without OPENAI_API_KEY;
// only voice notes and label scanning need it.
let openaiClient: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}
