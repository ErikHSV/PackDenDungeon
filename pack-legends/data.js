// Original-Helden von Pack Legends
// role: tank | striker | archer | mage | healer
// element: fire | water | nature | light | shadow

const RARITIES = {
  common:    { name: 'Gewöhnlich', mult: 1.0,  order: 0 },
  rare:      { name: 'Selten',     mult: 1.35, order: 1 },
  epic:      { name: 'Episch',     mult: 1.8,  order: 2 },
  legendary: { name: 'Legendär',   mult: 2.5,  order: 3 },
};

const ROLES = {
  tank:    { name: 'Wächter',   desc: 'Greift den vordersten Gegner an, nimmt 25 % weniger Schaden.' },
  striker: { name: 'Klinge',    desc: 'Greift den schwächsten Gegner an, 30 % Chance auf doppelten Schaden.' },
  archer:  { name: 'Schütze',   desc: 'Trifft einen zufälligen Gegner mit 115 % Angriff.' },
  mage:    { name: 'Magier',    desc: 'Trifft alle Gegner mit 50 % Angriff.' },
  healer:  { name: 'Heiler',    desc: 'Heilt den verletztesten Verbündeten um 130 % Angriff.' },
};

const ELEMENTS = {
  fire:   { name: 'Feuer',   icon: '🔥', strong: 'nature' },
  nature: { name: 'Natur',   icon: '🌿', strong: 'water' },
  water:  { name: 'Wasser',  icon: '💧', strong: 'fire' },
  light:  { name: 'Licht',   icon: '☀️', strong: 'shadow' },
  shadow: { name: 'Schatten',icon: '🌑', strong: 'light' },
};

// Basiswerte (vor Raritätsmultiplikator): hp, atk, spd
const HEROES = [
  // Gewöhnlich
  { id: 'h01', name: 'Bruno Eisenfaust', icon: '🛡️', rarity: 'common', role: 'tank',    element: 'nature', hp: 120, atk: 10, spd: 3 },
  { id: 'h02', name: 'Lina Flink',       icon: '🗡️', rarity: 'common', role: 'striker', element: 'shadow', hp: 70,  atk: 17, spd: 8 },
  { id: 'h03', name: 'Pip Bogensehne',   icon: '🏹', rarity: 'common', role: 'archer',  element: 'nature', hp: 75,  atk: 15, spd: 6 },
  { id: 'h04', name: 'Funkel-Fred',      icon: '✨', rarity: 'common', role: 'mage',    element: 'fire',   hp: 65,  atk: 14, spd: 5 },
  { id: 'h05', name: 'Schwester Mia',    icon: '🩹', rarity: 'common', role: 'healer',  element: 'light',  hp: 80,  atk: 11, spd: 4 },
  { id: 'h06', name: 'Kalle Kessel',     icon: '🍲', rarity: 'common', role: 'tank',    element: 'fire',   hp: 125, atk: 9,  spd: 2 },
  { id: 'h07', name: 'Nebel-Nora',       icon: '🌫️', rarity: 'common', role: 'striker', element: 'water',  hp: 72,  atk: 16, spd: 7 },
  { id: 'h08', name: 'Torfmoos-Tom',     icon: '🍄', rarity: 'common', role: 'healer',  element: 'nature', hp: 85,  atk: 10, spd: 3 },
  { id: 'h09', name: 'Pfützen-Paul',     icon: '🐸', rarity: 'common', role: 'archer',  element: 'water',  hp: 78,  atk: 14, spd: 6 },
  { id: 'h10', name: 'Ascheling',        icon: '🕯️', rarity: 'common', role: 'mage',    element: 'shadow', hp: 62,  atk: 15, spd: 5 },
  // Selten
  { id: 'h11', name: 'Greta Granitwall', icon: '🪨', rarity: 'rare', role: 'tank',    element: 'light',  hp: 130, atk: 10, spd: 3 },
  { id: 'h12', name: 'Rex Rostdolch',    icon: '⚔️', rarity: 'rare', role: 'striker', element: 'fire',   hp: 72,  atk: 18, spd: 8 },
  { id: 'h13', name: 'Wellenreiterin',   icon: '🌊', rarity: 'rare', role: 'mage',    element: 'water',  hp: 68,  atk: 15, spd: 6 },
  { id: 'h14', name: 'Falkenauge Jori',  icon: '🦅', rarity: 'rare', role: 'archer',  element: 'light',  hp: 76,  atk: 16, spd: 7 },
  { id: 'h15', name: 'Bruder Kamill',    icon: '🌼', rarity: 'rare', role: 'healer',  element: 'nature', hp: 82,  atk: 12, spd: 4 },
  { id: 'h16', name: 'Schattenkatze Miu',icon: '🐈‍⬛', rarity: 'rare', role: 'striker', element: 'shadow', hp: 70,  atk: 19, spd: 9 },
  { id: 'h17', name: 'Glutbär',          icon: '🐻', rarity: 'rare', role: 'tank',    element: 'fire',   hp: 140, atk: 9,  spd: 2 },
  // Episch
  { id: 'h18', name: 'Sturmhexe Vala',   icon: '⛈️', rarity: 'epic', role: 'mage',    element: 'water',  hp: 70,  atk: 17, spd: 6 },
  { id: 'h19', name: 'Ritter Aurelius',  icon: '🏰', rarity: 'epic', role: 'tank',    element: 'light',  hp: 140, atk: 11, spd: 3 },
  { id: 'h20', name: 'Dornenjägerin',    icon: '🌹', rarity: 'epic', role: 'archer',  element: 'nature', hp: 80,  atk: 17, spd: 7 },
  { id: 'h21', name: 'Mondpriesterin',   icon: '🌙', rarity: 'epic', role: 'healer',  element: 'shadow', hp: 85,  atk: 13, spd: 5 },
  { id: 'h22', name: 'Klingentänzer Zed',icon: '🌀', rarity: 'epic', role: 'striker', element: 'fire',   hp: 74,  atk: 20, spd: 9 },
  // Legendär
  { id: 'h23', name: 'Phönixkönigin Ira',icon: '🐦‍🔥', rarity: 'legendary', role: 'mage',    element: 'fire',   hp: 78,  atk: 19, spd: 7 },
  { id: 'h24', name: 'Urbaum Eldor',     icon: '🌳', rarity: 'legendary', role: 'tank',    element: 'nature', hp: 160, atk: 12, spd: 2 },
  { id: 'h25', name: 'Leere-Wanderer',   icon: '🕳️', rarity: 'legendary', role: 'striker', element: 'shadow', hp: 78,  atk: 22, spd: 10 },
  { id: 'h26', name: 'Sonnenseherin Ayla',icon: '🌞', rarity: 'legendary', role: 'healer', element: 'light',  hp: 90,  atk: 14, spd: 5 },
];

const MONSTERS = [
  { name: 'Schleimling',   icon: '🟢', role: 'tank',    element: 'nature', hp: 110, atk: 9,  spd: 2 },
  { name: 'Goblin',        icon: '👺', role: 'striker', element: 'fire',   hp: 65,  atk: 15, spd: 7 },
  { name: 'Skelettschütze',icon: '💀', role: 'archer',  element: 'shadow', hp: 60,  atk: 14, spd: 5 },
  { name: 'Irrlicht',      icon: '👻', role: 'mage',    element: 'light',  hp: 55,  atk: 13, spd: 6 },
  { name: 'Krabbenwache',  icon: '🦀', role: 'tank',    element: 'water',  hp: 120, atk: 8,  spd: 2 },
  { name: 'Wolf',          icon: '🐺', role: 'striker', element: 'nature', hp: 70,  atk: 14, spd: 8 },
  { name: 'Kultist',       icon: '🧟', role: 'healer',  element: 'shadow', hp: 70,  atk: 10, spd: 4 },
  { name: 'Feuerkobold',   icon: '😈', role: 'mage',    element: 'fire',   hp: 58,  atk: 14, spd: 6 },
  { name: 'Nixe',          icon: '🧜', role: 'healer',  element: 'water',  hp: 72,  atk: 10, spd: 5 },
];

const BOSSES = [
  { name: 'Steingolem',     icon: '🗿', role: 'tank',    element: 'nature', hp: 380, atk: 16, spd: 2 },
  { name: 'Drachenwelpe',   icon: '🐉', role: 'mage',    element: 'fire',   hp: 260, atk: 20, spd: 5 },
  { name: 'Kraken',         icon: '🐙', role: 'mage',    element: 'water',  hp: 300, atk: 18, spd: 4 },
  { name: 'Schattenfürst',  icon: '🧛', role: 'striker', element: 'shadow', hp: 260, atk: 26, spd: 8 },
  { name: 'Erzengel a. D.', icon: '👼', role: 'healer',  element: 'light',  hp: 320, atk: 18, spd: 5 },
];

const PACKS = {
  free:    { size: 2, cost: 0,   rates: { common: 75, rare: 20, epic: 4.5, legendary: 0.5 } },
  basic:   { size: 3, cost: 50,  rates: { common: 70, rare: 24, epic: 5,   legendary: 1 } },
  premium: { size: 5, cost: 180, rates: { common: 45, rare: 38, epic: 14,  legendary: 3 }, guarantee: 'rare' },
  mythic:  { size: 5, cost: 600, rates: { common: 10, rare: 45, epic: 35,  legendary: 10 }, guarantee: 'epic' },
};
