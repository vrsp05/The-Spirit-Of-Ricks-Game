// Per-era time of day, weather and season. Tweak freely: colours are CSS hex, the sun is an
// offset from the player (x = east, y = up, z = south; it sets both light direction and shadows).
// `season` recolours trees and grass and picks the weather particles.
import type { EraId } from '../world/eras';

export type Season = 'autumn' | 'spring' | 'winter' | 'summer';
export interface Atmosphere {
  label: string;
  sun: [number, number, number]; sunColor: string; sunIntensity: number;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  skyTop: string; skyMid: string; horizon: string; cloud: string;
  fog: string; fogDensity: number;
  envIntensity: number; exposure: number; season: Season;
}

export const ATMOSPHERE: Record<EraId, Atmosphere> = {
  ricks1999: {
    label: 'Fall 1999 — warm late afternoon, autumn leaves',
    sun: [-70, 55, 30], sunColor: '#ffd29a', sunIntensity: 2.6,
    hemiSky: '#efe3cc', hemiGround: '#6b5a40', hemiIntensity: 0.55,
    skyTop: '#4f86c0', skyMid: '#b3c6d6', horizon: '#ecd4b0', cloud: '#f2dcc0',
    fog: '#dccbb0', fogDensity: 0.0038,
    envIntensity: 0.5, exposure: 0.74, season: 'autumn',
  },
  transition: {
    label: 'Spring 2001 — fresh, clear morning',
    sun: [55, 85, -40], sunColor: '#fff3de', sunIntensity: 2.4,
    hemiSky: '#e2f0ff', hemiGround: '#5f6b4a', hemiIntensity: 0.6,
    skyTop: '#3a7cc6', skyMid: '#a1c8ea', horizon: '#d4e6f2', cloud: '#c9d6e3',
    fog: '#cfe0ea', fogDensity: 0.0034,
    envIntensity: 0.55, exposure: 0.72, season: 'spring',
  },
  byui: {
    label: '2011 — bright winter day, snow on the roofs',
    sun: [35, 70, 65], sunColor: '#fff6ea', sunIntensity: 2.3,
    hemiSky: '#e9f1fb', hemiGround: '#9aa0a8', hemiIntensity: 0.75,
    skyTop: '#4a80bb', skyMid: '#b9d0e4', horizon: '#e6eef4', cloud: '#d6dee8',
    fog: '#dfe7ef', fogDensity: 0.0044,
    envIntensity: 0.6, exposure: 0.68, season: 'winter',
  },
  presentFinale: {
    label: 'Present day — sunny summer afternoon',
    sun: [-45, 90, 40], sunColor: '#fff0d8', sunIntensity: 2.5,
    hemiSky: '#e0eeff', hemiGround: '#5f6a48', hemiIntensity: 0.6,
    skyTop: '#3478c4', skyMid: '#9ec6ea', horizon: '#d2e4f0', cloud: '#cfdbe7',
    fog: '#cbdde9', fogDensity: 0.0034,
    envIntensity: 0.55, exposure: 0.72, season: 'summer',
  },
};
