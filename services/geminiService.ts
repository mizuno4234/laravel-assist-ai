import { GoogleGenAI, Content } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

// Initialize AI client dynamically based on provided key
const getAiClient = (apiKey: string) => {
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Helper for exponential backoff to handle rate limits
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    // Check for 429 or similar quota errors
    // The error object structure can vary, so we check status and message string
    const isQuotaError = 
      error?.status === 429 || 
      error?.message?.includes('429') || 
      error?.message?.includes('Quota exceeded') ||
      error?.message?.includes('RESOURCE_EXHAUSTED');

    if (retries > 0 && isQuotaError) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const sendMessageStream = async (
  apiKey: string,
  modelId: string,
  history: Content[],
  message: string,
  systemInstruction: string = SYSTEM_INSTRUCTION
) => {
  const ai = getAiClient(apiKey);
  if (!ai) {
    throw new Error("API Key is missing. Please set it in the settings.");
  }

  const chat = ai.chats.create({
    model: modelId,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.2,
    },
    history: history,
  });

  return retryOperation(() => chat.sendMessageStream({ message }));
};

export const generateStaticAnalysis = async (
  apiKey: string,
  modelId: string,
  context: string,
  query: string
) => {
  const ai = getAiClient(apiKey);
  if (!ai) {
    throw new Error("API Key is missing. Please set it in the settings.");
  }

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `CONTEXT:\n${context}\n\nQUERY:\n${query}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // thinkingConfig is supported in 2.5 series and 3.0-pro.
        // However, we disable strict thinking budget config for generic calls to avoid model mismatch errors
        // unless we are sure the model supports it. 2.5-flash and 3-pro both support it.
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    return response.text;
  });
};