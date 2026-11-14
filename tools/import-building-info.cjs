// Import the approved reference text; editorial notes never enter player cards.
// node tools/import-building-info.cjs "path/to/building_info_cards.txt"
const fs = require('node:fs');
const path = require('node:path');

function parseBuildingInfo(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const entries = [...normalized.matchAll(/^\d{2}\. (.+)\nGame ID: ([^\n]+)\n([\s\S]*?)(?=\n[-=]{5,}|(?![\s\S]))/gm)];
  const ids = new Set();
  const paragraph = value => value.trim().replace(/\s*\n\s*/g, ' ');
  const cards = entries.map(([, name, id, body]) => {
    const about = body.match(/^About: ([\s\S]*?)\n\nInteresting fact:/m)?.[1];
    const fact = body.match(/^Interesting fact: ([\s\S]*?)\n\nSource:/m)?.[1];
    const source = body.match(/^Source: ([^\n]+)\n(https?:\/\/\S+)/m);
    if (!about || !fact || !source || ids.has(id)) throw new Error(`Incomplete or duplicate building card: ${id}`);
    ids.add(id);
    return { id, name, about: paragraph(about), fact: paragraph(fact), source: { title: source[1], url: source[2] } };
  });
  if (!cards.length) throw new Error('No building cards found in the reference file.');
  return cards;
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error('Provide the path to building_info_cards.txt.');
  const cards = parseBuildingInfo(fs.readFileSync(process.argv[2], 'utf8'));
  const output = path.resolve(__dirname, '../src/world/data/building-info.json');
  fs.writeFileSync(output, JSON.stringify(cards, null, 2) + '\n');
  console.log(`Imported ${cards.length} building cards into ${output}`);
}

module.exports = { parseBuildingInfo };
