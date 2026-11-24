// The player's wardrobe: outfits change clothes only (skin and hair stay the same).
// Pick one from the wardrobe in your apartment or from the pause menu; the choice is saved.
import type { AvatarLook } from './Avatar';

export interface Outfit { id: string; name: string; note: string; look: Partial<AvatarLook> }

/** Skin and hair of the player character (shared by every outfit). */
export const PLAYER_BASE: AvatarLook = { shirt: '#f2efe6', pants: '#3a4252', skin: '#e2b893', hair: '#4a3324' };

export const OUTFITS: Outfit[] = [
  { id: 'assistant', name: 'Assistant to the President', note: 'White shirt and a blue tie — the classic.', look: { shirt: '#f2efe6', pants: '#3a4252', tie: '#3b5b8c' } },
  { id: 'sunday', name: 'Sunday suit', note: 'Dark suit, white shirt, red tie.', look: { shirt: '#f4f2ec', jacket: '#262a33', pants: '#262a33', tie: '#8d2f2f', shoes: '#151515' } },
  { id: 'flannel', name: 'Rexburg flannel', note: 'Red plaid, jeans and a cap.', look: { shirt: '#9b3b32', pattern: 'flannel', pants: '#3f5a7a', hat: 'cap', hatColor: '#2f3a4a' } },
  { id: 'gameday', name: 'Game day', note: 'School-spirit blue and white.', look: { shirt: '#1f4e8c', pattern: 'stripe', pants: '#2c2f36', hat: 'cap', hatColor: '#f4f1e8', shoes: '#f4f1e8' } },
  { id: 'sporty', name: 'Intramurals', note: 'T-shirt, shorts and sneakers.', look: { shirt: '#2fbf71', pants: '#2a2a2a', shorts: true, shoes: '#f4f1e8' } },
  { id: 'farmer', name: 'Potato farmer', note: 'Green flannel, work pants, straw-coloured cap.', look: { shirt: '#4a6d3b', pattern: 'flannel', pants: '#5a4a3a', hat: 'cap', hatColor: '#c9a44a', shoes: '#4a3424' } },
  { id: 'lab', name: 'Science lab', note: 'Lab coat and safety glasses.', look: { shirt: '#f2efe6', coat: '#f4f4ee', pants: '#3a4252', glasses: true, tie: '#3b6d5b' } },
  { id: 'winter', name: 'Idaho winter', note: 'Coat, scarf and a warm beanie.', look: { shirt: '#f2efe6', coat: '#2b3a4f', scarf: '#8d3b2f', pants: '#3a4252', hat: 'beanie', hatColor: '#8d3b2f' } },
  { id: 'pajamas', name: 'Pajamas', note: 'Striped and comfy. Perfect for the apartment.', look: { shirt: '#7b8fc4', pattern: 'stripe', pants: '#7b8fc4', shoes: '#c9c3b8' } },
];

export function outfitById(id: string | undefined): Outfit { return OUTFITS.find(o => o.id === id) ?? OUTFITS[0]; }

/** The full look for an outfit; in winter, outfits without a coat get the warm coat and scarf on top. */
export function outfitLook(id: string | undefined, winter: boolean): AvatarLook {
  const o = outfitById(id), look: AvatarLook = { ...PLAYER_BASE, ...o.look };
  if (winter && !look.coat && !look.shorts && o.id !== 'pajamas') { look.coat = '#2b3a4f'; look.scarf = look.scarf ?? '#8d3b2f'; }
  return look;
}
