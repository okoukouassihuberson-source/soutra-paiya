/**
 * Module Chat — accès aux DM 1-on-1.
 *
 * Tables : `chats`, `chat_members`, `messages` (déjà présentes depuis 0001).
 * RPC : `open_dm`, `list_my_chats`, `mark_chat_read` (migration 0024).
 */

import { supabase } from './supabase';

export type ChatListItem = {
  chat_id: string;
  chat_type: string;
  other_user_id: string;
  other_name: string | null;
  other_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  created_at: string;
};

export async function openDm(otherUserId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc('open_dm', { p_other: otherUserId });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('open_dm: id manquant');
  return data;
}

export async function listChats(): Promise<ChatListItem[]> {
  const { data, error } = await (supabase as any).rpc('list_my_chats');
  if (error) throw error;
  return (data || []) as ChatListItem[];
}

export async function listMessages(chatId: string, opts?: { before?: string; limit?: number }): Promise<ChatMessage[]> {
  let q = (supabase as any)
    .from('messages')
    .select('id, chat_id, sender_id, body, attachment_url, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw error;
  // On renvoie en ordre chronologique (ascendant) pour l'affichage simple.
  return ((data || []) as ChatMessage[]).reverse();
}

export async function sendMessage(chatId: string, body: string): Promise<ChatMessage> {
  const text = body.trim();
  if (!text) throw new Error('Message vide.');
  if (text.length > 4000) throw new Error('Message trop long (4000 caractères max).');

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Session expirée.');

  const { data, error } = await (supabase as any)
    .from('messages')
    .insert({ chat_id: chatId, sender_id: user.id, body: text })
    .select('id, chat_id, sender_id, body, attachment_url, created_at')
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function markChatRead(chatId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('mark_chat_read', { p_chat_id: chatId });
  if (error) console.warn('[chat] mark_chat_read failed:', error);
}
