// Six rarity tiers, 1 = the answer everyone thinks of, 6 = almost nobody.
// Tier names are placeholders until the theme is chosen; points are fixed.
export const TIERS = [
    { tier: 1, name: 'Obvious', points: 10 },
    { tier: 2, name: 'Common', points: 25 },
    { tier: 3, name: 'Decent', points: 40 },
    { tier: 4, name: 'Clever', points: 60 },
    { tier: 5, name: 'Rare', points: 80 },
    { tier: 6, name: 'Legendary', points: 100 },
];

export const PROMPT_COUNT = 7;
export const PROMPT_SECONDS = 25;

export const tierInfo = tier => TIERS[tier - 1] || null;
export const pointsFor = tier => tierInfo(tier)?.points ?? 0;
