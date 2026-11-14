import cards from './data/building-info.json';

export interface BuildingInfo {
  id: string;
  name: string;
  about: string;
  fact: string;
  source: { title: string; url: string };
}

// Dates remain in the text: the complete card is available in every game era.
export const BUILDING_INFO: readonly BuildingInfo[] = cards;
const byId = new Map(BUILDING_INFO.map(card => [card.id, card]));
export const getBuildingInfo = (id: string) => byId.get(id);
export const BUILDING_INFO_RANGE = 14;
