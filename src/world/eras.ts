// World states. TEAM DECISION (playtest 2): nothing refers to BYU–Idaho until all
// three quests are done — the middle states are an artistic "campus grows" progression
// still under the Ricks College name. Internal ids are kept for save compatibility.
// Historical world states. `year` is a decimal year used to evaluate building
// date ranges in buildingRegistry.ts. Which era follows which quest is a story
// decision (see GAME_CONFIG.story) and is NOT fixed here.
export type EraId = 'ricks1999' | 'transition' | 'byui' | 'presentFinale';

export interface EraDef {
  id: EraId;
  year: number;
  label: string;       // HUD label
  cardTitle: string;   // shown on the signposted time-transition card
  institution: 'ricks' | 'ricksTransition' | 'byui';
}

export const ERAS: Record<EraId, EraDef> = {
  // After the Kimball Building dedication (Sept 7, 1999); before the June 21, 2000 announcement.
  ricks1999: { id: 'ricks1999', year: 1999.8, label: 'Fall 1999 · Ricks College', cardTitle: 'Rexburg, Idaho — Fall 1999', institution: 'ricks' },
  // After original Spori demolition (Nov 2000) and Multi-Use/Hinckley groundbreaking (Apr 18, 2001).
  transition: { id: 'transition', year: 2001.35, label: 'Ricks College · a new chapter', cardTitle: 'Time passes…', institution: 'ricksTransition' },
  // After Rexburg Idaho Temple dedication (Feb 10, 2008); before the BYU–Idaho Center (Dec 2010).
  byui: { id: 'byui', year: 2008.3, label: 'Ricks College · the campus grows', cardTitle: 'More time passes…', institution: 'ricksTransition' },
  presentFinale: { id: 'presentFinale', year: 2026.0, label: 'Present day · BYU–Idaho', cardTitle: 'Ricks College is now BYU–Idaho', institution: 'byui' },
};

export const ERA_ORDER: EraId[] = ['ricks1999', 'transition', 'byui', 'presentFinale'];
