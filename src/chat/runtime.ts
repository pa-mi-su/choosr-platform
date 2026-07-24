import { ChatSession } from './application/ChatSession';
import { SupabaseChatGateway } from './infrastructure/SupabaseChatGateway';

export const chatSession = new ChatSession(new SupabaseChatGateway());
