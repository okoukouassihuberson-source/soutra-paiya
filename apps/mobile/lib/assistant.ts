/**
 * Module Assistant — accès à la fonction Edge `chatbot` (Claude).
 */

import { invokeEdge } from './edge';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantReply = {
  reply: string;
  usage?: { input_tokens: number; output_tokens: number } | null;
  model?: string;
};

export async function askAssistant(messages: ChatMessage[]): Promise<AssistantReply> {
  return invokeEdge<AssistantReply>('chatbot', { messages });
}
