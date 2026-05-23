/**
 * Module Comments — accès aux commentaires sous posts.
 */

import { supabase } from './supabase';

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: { id: string; full_name: string | null; phone: string | null; avatar_url: string | null };
};

export async function listComments(postId: string): Promise<Comment[]> {
  const { data: comments, error } = await (supabase as any)
    .from('post_comments')
    .select('id, post_id, user_id, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c: Comment) => c.user_id))];
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, phone, avatar_url')
    .in('id', userIds);
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));

  return comments.map((c: Comment) => ({ ...c, author: byId.get(c.user_id) as Comment['author'] }));
}

export async function createComment(input: { postId: string; userId: string; body: string }): Promise<Comment> {
  const body = input.body.trim();
  if (!body) throw new Error('Commentaire vide.');
  if (body.length > 1000) throw new Error('Commentaire trop long (1000 caractères max).');

  const { data, error } = await (supabase as any)
    .from('post_comments')
    .insert({ post_id: input.postId, user_id: input.userId, body })
    .select('id, post_id, user_id, body, created_at')
    .single();
  if (error) throw error;

  // Charge le profil auteur pour l'affichage immédiat.
  const { data: prof } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, phone, avatar_url')
    .eq('id', input.userId)
    .single();

  return { ...(data as Comment), author: prof as Comment['author'] };
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await (supabase as any).from('post_comments').delete().eq('id', id);
  if (error) throw error;
}
