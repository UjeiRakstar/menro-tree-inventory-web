import { supabase } from '../supabaseClient.js';
import { officeOf } from './officeSettings.js';
import { LIMITS, shrinkImage } from './shrinkImage.js';

/**
 * The account holder's own photo and designation — set at onboarding, and
 * changed later under Settings → Your account.
 */
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const DESIGNATIONS = [
  'MENRO',
  'CENRO',
  'Municipal Environment and Natural Resources Officer',
  'City Environment and Natural Resources Officer',
  'Environmental Management Specialist',
  'Forest Ranger',
  'Administrative Aide',
];

export const PGENRO_DESIGNATIONS = [
  'PGENRO',
  'Provincial Government Environment and Natural Resources Officer',
  'Forester',
  'Environmental Management Specialist',
  'Administrative Aide',
];

/**
 * Shrinks the picked photo and keeps it in the office's folder of the
 * 'office-logos' bucket; resolves to its public URL. Throws with a sentence
 * to show when it cannot.
 */
export async function uploadHolderPhoto(profile, picked) {
  // Any size: resized here, so what is kept is the small one.
  const file = await shrinkImage(picked, LIMITS.photo);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${officeOf(profile)}/holder-${profile.id}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('office-logos').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`The photo could not be uploaded: ${error.message}`);
  return supabase.storage.from('office-logos').getPublicUrl(path).data.publicUrl;
}
