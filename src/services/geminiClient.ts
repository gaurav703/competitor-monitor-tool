import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export async function generateGeminiText(params: {
  input: string;
  systemInstruction: string;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const interaction = await ai.interactions.create({
    model: env.geminiModel,
    input: params.input,
    system_instruction: params.systemInstruction,
    response_format: {
      type: "text",
      mime_type: "application/json",
    },
  });

  const text = interaction.output_text?.trim() ?? "";
  if (!text) {
    throw new Error("Gemini returned empty output.");
  }
  return text;
}
