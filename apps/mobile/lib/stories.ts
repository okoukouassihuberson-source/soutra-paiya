/**
 * Module Stories — accès aux stories 24h.
 *
 * Tables : `stories` (déjà présente depuis 0001), `story_views` (0025).
 * Convention de path pour le bucket social-media : `<user_id>/story-<ts>.<ext>`.
 */

import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type StoryStripItem = {
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  latest_story_at: string;
  total_stories: number;
  has_unviewed: boolean;
};

export type StoryItem = {
  id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  view_count: number;
  viewed_by_me: boolean;
  mine: boolean;
};

export async function listActiveStories(): Promise<StoryStripItem[]> {
  const { data, error } = await (supabase as any).rpc('list_active_stories');
  if (error) throw error;
  return (data || []) as StoryStripItem[];
}

export async function listUserStories(userId: string): Promise<StoryItem[]> {
  const { data, error } = await (supabase as any).rpc('list_user_stories', { p_user_id: userId });
  if (error) throw error;
  return (data || []) as StoryItem[];
}

export async function markStoryViewed(storyId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('mark_story_viewed', { p_story_id: storyId });
  if (error) console.warn('[stories] mark_story_viewed failed:', error);
}

export async function createStory(input: {
  userId: string;
  image: ImagePicker.ImagePickerAsset;
  caption?: string;
}): Promise<StoryItem> {
  if (!input.image.base64) throw new Error('Image sans base64 — relance le picker avec base64:true.');
  const ext = (input.image.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${input.userId}/story-${Date.now()}.${ext || 'jpg'}`;
  const buf = decode(input.image.base64);

  const { error: upErr } = await supabase.storage
    .from('social-media')
    .upload(path, buf, {
      contentType: input.image.mimeType || `image/${ext || 'jpeg'}`,
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);
  const mediaUrl = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl;

  const { data, error } = await (supabase as any)
    .from('stories')
    .insert({
      user_id: input.userId,
      media_url: mediaUrl,
      media_type: 'image', // V1 : images uniquement
      caption: input.caption?.trim() || null,
    })
    .select('id, media_url, media_type, caption, created_at')
    .single();
  if (error) throw error;
  return { ...(data as any), view_count: 0, viewed_by_me: false, mine: true };
}

export async function deleteStory(storyId: string): Promise<void> {
  const { error } = await (supabase as any).from('stories').delete().eq('id', storyId);
  if (error) throw error;
}
