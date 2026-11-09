// Données initiales (utilisées uniquement au premier lancement)
const SEED_SUPPORTS = [
  { name: 'Physique',   cats: ['livre'] },
  { name: 'Numérique',  cats: ['film', 'jeu', 'livre'] },
  { name: 'DVD',        cats: ['film'] },
  { name: 'BLU-RAY',    cats: ['film', 'jeu'] },
  { name: 'BLU-RAY 4K', cats: ['film'] },
  { name: 'CD',         cats: ['jeu'] },
  { name: 'Cartouche',  cats: ['jeu'] },
  { name: 'GKC',        cats: ['jeu'] },
  { name: 'VHS',        cats: ['film'] },
];

const SEED_CONSOLES = ['N64', 'GameGear', 'Evercade', 'Playstation', 'DS', '3DS', 'PSP', 'GB', 'GBC', 'GBA', 'GC', 'WII', 'WIIU', 'Switch', 'Switch2', 'PS2', 'PS3', 'PS4', 'PS5', 'XBOX', 'XBOX360', 'XBOXONE', 'XBOXSeries'];

const SEED_GENRES_RAW = {
  film: `Action ; Aventure ; Animation ; Arts martiaux ; Biopic ; Catastrophe ; Comédie ; Comédie dramatique ; Comédie romantique ; Comédie noire ; Crime ; Cyberpunk ; Danse ; Documentaire ; Drame ; Drame historique ; Drame psychologique ; Épouvante ; Érotique ; Espionnage ; Expérimental ; Fantastique ; Fantasy ; Film noir ; Guerre ; Historique ; Horreur ; Musical ; Mystère ; Policier ; Post-apocalyptique ; Romance ; Road movie ; Science-fiction ; Slasher ; Sport ; Super-héros ; Suspense ; Thriller ; Thriller psychologique ; Western ; Survival ; Satire ; Parodie ; Tranche de vie ; Film judiciaire ; Film de procès ; Film d'enquête ; Film de casse ; Film de survie ; Film de monstres ; Film de zombies ; Film de vampires`,
  jeu: `Action ; Action-aventure ; Aventure ; Aventure narrative ; Beat'em up ; Battle royale ; Bullet hell ; Casse-tête ; Casual ; Clicker ; Construction ; Course ; Crafting ; Danse ; Dating sim ; Dungeon crawler ; Éducatif ; Escape game ; Exploration ; FPS; TPS; Fantasy ; Fighting game ; Gestion ; Grand Strategy ; Hack and slash ; Horreur ; Infiltration ; Jeu de cartes ; Jeu de rythme ; Jeu de société ; Jeu de tir ; Jeu musical ; Jeu narratif ; Jeu de plateforme ; Jeu de réflexion ; Jeu de survie ; Jeu de simulation ; Jeu de sport ; MMORPG ; MOBA ; Metroidvania ; Monde ouvert ; Party game ; Point and click ; Puzzle ; Roguelike ; Roguelite ; RPG ; JRPG ; Tactical RPG ; Science-fiction; Simulation de vie ; Simulation de vol ; Simulation automobile ; Soulslike ; Stealth ; Stratégie ; RTS; Stratégie au tour par tour ; Tower defense ; Visual novel ; Walking simulator ; Sandbox ; Extraction shooter ; Auto-battler ; Metagame ; Tycoon`,
  livre: `Action ; Aventure ; Autobiographie ; Biographie ; Classique ; Conte ; Conte philosophique ; Dark romance ; Développement personnel ; Dystopie ; Épistolaire ; Érotique ; Essai ; Fantastique ; Fantasy ; Fantasy épique ; Fantasy urbaine ; Fantasy sombre (Dark Fantasy) ; Fiction historique ; Fiction contemporaine ; Fiction littéraire ; Fiction psychologique ; Feel-good ; Horreur ; Historique ; Humour ; Initiatique ; Journal intime ; Littérature jeunesse ; Littérature générale ; Littérature engagée ; Littérature féministe ; Littérature LGBTQ+ ; Manga ; Mystère ; Mythologie ; Nouvelle ; Paranormal ; Philosophie ; Policier ; Polar ; Post-apocalyptique ; Poésie ; Romance ; Romance contemporaine ; Romance historique ; Romantasy ; Roman d'apprentissage ; Roman d'amour ; Roman d'espionnage ; Roman d'aventure ; Roman noir ; Roman social ; Science-fiction ; Space opera ; Steampunk ; Thriller ; Thriller psychologique ; Thriller domestique ; Thriller juridique ; Suspense ; Témoignage ; Tragédie ; Uchronie ; Urban fantasy ; Western ; Voyage ; Guide pratique ; Livre documentaire ; Livre scientifique ; Livre historique ; Bande dessinée ; Manga seinen ; Manga shōnen ; Manga shōjo ; Manga josei ; Manhwa ; Manhua ; Graphic novel`,
};

function buildSeedGenres() {
  const map = new Map();
  for (const [cat, raw] of Object.entries(SEED_GENRES_RAW)) {
    for (const g of raw.split(';').map(s => s.trim()).filter(Boolean)) {
      const k = g.toLowerCase();
      if (!map.has(k)) map.set(k, { name: g, cats: [] });
      const e = map.get(k);
      if (!e.cats.includes(cat)) e.cats.push(cat);
    }
  }
  return [...map.values()];
}
