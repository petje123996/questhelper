// Fallback quest lists, used until the live wiki category/guide fetch
// completes (or if it ever fails). Shared between the home page and the
// dashboard's "next quest" summary, so both agree even before either has
// fetched anything live.

export const POPULAR = [
  "Cook's Assistant", "The Restless Ghost", "Rune Mysteries", "Sheep Shearer",
  "Imp Catcher", "Romeo & Juliet", "Doric's Quest", "Ernest the Chicken",
  "Vampyre Slayer", "The Knight's Sword", "Dragon Slayer I", "Waterfall Quest",
  "Tree Gnome Village", "Fight Arena", "The Grand Tree", "Priest in Peril",
  "Witch's House", "Monkey Madness I", "Recipe for Disaster",
  "Animal Magnetism", "Lost City", "Desert Treasure I", "Monk's Friend",
  "Plague City", "Dwarf Cannon", "The Dig Site", "Druidic Ritual",
  "Client of Kourend", "X Marks the Spot", "A Porcine of Interest",
];

// Fallback F2P list, used if the wiki category can't be fetched
export const F2P_FALLBACK = [
  "Below Ice Mountain", "Black Knights' Fortress", "Cook's Assistant",
  "The Corsair Curse", "Demon Slayer", "Doric's Quest", "Dragon Slayer I",
  "Ernest the Chicken", "Goblin Diplomacy", "Imp Catcher",
  "The Knight's Sword", "Misthalin Mystery", "Pirate's Treasure",
  "Prince Ali Rescue", "The Restless Ghost", "Romeo & Juliet",
  "Rune Mysteries", "Sheep Shearer", "Shield of Arrav", "Vampyre Slayer",
  "Witch's Potion", "X Marks the Spot",
];

export const MINI_FALLBACK = [
  "Barbarian Training", "Bear Your Soul", "Daddy's Home", "Enter the Abyss",
  "Family Pest", "Hopespear's Will", "In Search of Knowledge",
  "Lair of Tarn Razorlor", "Skippy and the Mogres", "The Frozen Door",
  "The General's Shadow", "The Mage Arena", "The Mage Arena II",
];

// Fallback Optimal Quest Guide order, used until the live wiki fetch
// completes (or if it ever fails) — transcribed from the wiki's "Optimal
// quest guide" page. "Recipe for Disaster/..." subpages are collapsed to
// the single master quest name (matching the live-fetch parser in
// app/page.tsx), since that's what actually appears in the quest
// journal / allQuests. "Train X to level Y", "Unlock: ..." and
// Achievement Diary rows are left out — they aren't quests, so they'd
// never match anything in allQuests anyway.
export const OPTIMAL_FALLBACK = [
  "Learning the Ropes", "Cook's Assistant", "Sheep Shearer", "Misthalin Mystery",
  "Prince Ali Rescue", "The Restless Ghost", "Rune Mysteries", "Imp Catcher",
  "Witch's Potion", "Gertrude's Cat", "Children of the Sun", "Natural History Quiz",
  "Daddy's Home", "Dwarf Cannon", "Waterfall Quest", "Tree Gnome Village",
  "Doric's Quest", "Witch's House", "The Knight's Sword", "The Tourist Trap",
  "Black Knights' Fortress", "Druidic Ritual", "Recruitment Drive", "Goblin Diplomacy",
  "Sleeping Giants", "Fight Arena", "Plague City", "Monk's Friend", "Hazeel Cult",
  "Sheep Herder", "Biohazard", "Tower of Life", "Tribal Totem", "Death Plateau",
  "Merlin's Crystal", "Holy Grail", "Murder Mystery", "The Grand Tree",
  "Rag and Bone Man I", "Priest in Peril", "Nature Spirit", "Ghosts Ahoy",
  "Making History", "The Ides of Milk", "The Lost Tribe", "Death to the Dorgeshuun",
  "Elemental Workshop I", "Icthlarin's Little Helper", "The Golem",
  "The Ribbiting Tale of a Lily Pad Labour Dispute", "Lost City",
  "Fairytale I - Growing Pains", "Recipe for Disaster", "Sea Slug", "Pandemonium",
  "Prying Times", "Current Affairs", "Fishing Contest", "Mountain Daughter",
  "Ratcatchers", "The Feud", "Death on the Isle", "Alfred Grimhand's Barcrawl",
  "Scorpion Catcher", "The Dig Site", "Elemental Workshop II", "A Soul's Bane",
  "Enter the Abyss", "X Marks the Spot", "Pirate's Treasure", "Client of Kourend",
  "The Queen of Thieves", "The Depths of Despair", "A Porcine of Interest",
  "Wanted!", "Shield of Arrav", "Bone Voyage", "Watchtower", "The Giant Dwarf",
  "Forgettable Tale...", "Another Slice of H.A.M.", "Vampyre Slayer",
  "Ernest the Chicken", "Demon Slayer", "Shadow of the Storm", "Horror from the Deep",
  "Animal Magnetism", "Creature of Fenkenstrain", "Big Chompy Bird Hunting",
  "Jungle Potion", "Shilo Village", "Zogre Flesh Eaters", "Observatory Quest",
  "Spirits of the Elid", "Garden of Tranquillity", "Enlightened Journey",
];
