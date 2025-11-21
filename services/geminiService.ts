import { GoogleGenAI, Content } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

// Initialize AI client dynamically based on provided key
const getAiClient = (apiKey: string) => {
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const sendMessageStream = async (
  apiKey: string,
  history: Content[],
  message: string,
  systemInstruction: string = SYSTEM_INSTRUCTION
) => {
  const ai = getAiClient(apiKey);
  if (!ai) {
    throw new Error("API Key is missing. Please set it in the settings.");
  }

  // Use gemini-3-pro-preview for complex code reasoning
  const modelId = 'gemini-3-pro-preview';

  const chat = ai.chats.create({
    model: modelId,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.2, // Low temperature for consistent code generation
    },
    history: history,
  });

  return chat.sendMessageStream({ message });
};

export const generateStaticAnalysis = async (
  apiKey: string,
  context: string,
  query: string
) => {
  const ai = getAiClient(apiKey);
  if (!ai) {
    throw new Error("API Key is missing. Please set it in the settings.");
  }

  const modelId = 'gemini-3-pro-preview';

  const response = await ai.models.generateContent({
    model: modelId,
    contents: `CONTEXT:\n${context}\n\nQUERY:\n${query}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingBudget: 2048 } // Enable thinking for deep analysis
    }
  });

  return response.text;
};