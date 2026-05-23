/**
 * Module Social — accès posts / likes.
 *
 * Pattern volontairement simple : pas de cache custom, on s'appuie sur le
 * Realtime Supabase (publication `supabase_realtime`) pour rafraîchir le
 * feed. Pour les images, on upload dans le bucket `social-media` avec un
 * path `<user_id>/<timestamp>.<ext>` — c'est ce que la policy SECURITY DEFINER
 * `can_write_social_media` attend (cf. migration 0022).
 */

import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type Post = {
  id: string;
  user_id: string;
  body: string | null;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  // Joints côté client (lookup profiles + post_likes).
  author?: { id: string; full_name: string | null; phone: string | null; avatar_url: string | null };
  liked_by_me?: boolean;
};

const PAGE_SIZE = 30;

/** Charge la page de posts la plus récente, plus les infos auteur + état de like du caller. */
export async function listFeed(opts?: { before?: string; userIdForLikes?: string | null }): Promise<Post[]> {
  let query = (supabase as any)
    .from('posts')
    .select('id, user_id, body, image_url, like_count, comment_count, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (opts?.before) query = query.lt('created_at', opts.before);

  const { data: posts, error } = await query;
  if (error) throw error;
  if (!posts || posts.length === 0) return [];

  const userIds = [...new Set(posts.map((p: Post) => p.user_id))];
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, phone, avatar_url')
    .in('id', userIds);
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));

  // État de like : on n'interroge que si on a un caller authentifié.
  let likedSet = new Set<string>();
  if (opts?.userIdForLikes) {
    const postIds = posts.map((p: Post) => p.id);
    const { data: likes } = await (supabase as any)
      .from('post_likes')
      .select('post_id')
      .in('post_id', postIds)
      .eq('user_id', opts.userIdForLikes);
    likedSet = new Set((likes || []).map((l: any) => l.post_id));
  }

  return posts.map((p: Post) => ({
    ...p,
    author: byId.get(p.user_id) as Post['author'],
    liked_by_me: likedSet.has(p.id),
  }));
}

/** Toggle « j'aime » sur un post pour l'utilisateur courant. Renvoie le nouvel état. */
export async function toggleLike(postId: string, userId: string, wasLiked: boolean): Promise<boolean> {
  if (wasLiked) {
    const { error } = await (supabase as any)
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw error;
    return false;
  }
  // upsert ignore en cas de double-clic : la PK (post_id,user_id) garantit l'unicité.
  const { error } = await (supabase as any)
    .from('post_likes')
    .insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error; // 23505 = unique_violation, déjà liké
  return true;
}

/** Crée un post. Si une image est fournie, on l'upload d'abord dans le bucket social-media. */
export async function createPost(input: {
  userId: string;
  body: string;
  image?: ImagePicker.ImagePickerAsset | null;
}): Promise<Post> {
  const body = input.body.trim();
  let imageUrl: string | null = null;

  if (input.image) {
    const asset = input.image;
    if (!asset.base64) throw new Error('Image sans base64 — relance le picker avec base64:true.');
    const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${input.userId}/${Date.now()}.${ext || 'jpg'}`;
    const buf = decode(asset.base64);
    const { error: upErr } = await supabase.storage
      .from('social-media')
      .upload(path, buf, {
        contentType: asset.mimeType || `image/${ext || 'jpeg'}`,
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);
    imageUrl = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl;
  }

  if (!body && !imageUrl) {
    throw new Error('Ajoute un texte ou une image avant de publier.');
  }

  const { data, error } = await (supabase as any)
    .from('posts')
    .insert({ user_id: input.userId, body: body || null, image_url: imageUrl })
    .select('id, user_id, body, image_url, like_count, comment_count, created_at')
    .single();
  if (error) throw error;
  return data as Post;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await (supabase as any).from('posts').delete().eq('id', postId);
  if (error) throw error;
}
