// Themes a creator can pick for their game. A theme renames the six tiers,
// sets their colours, and supplies the scene shown after each answer —
// including what happens when an answer scores nothing. Points never change.
import { TIERS } from '../tiers.js';
import { renderChristmas } from './christmas.js';
import { renderDisco } from './disco.js';

export const THEMES = [
    {
        id: 'classic',
        label: 'Classic',
        blurb: 'Plain tier bars',
        tierNames: TIERS.map(t => t.name),
        colors: null,          // uses the page's own tier colours
        zeroTitle: null,
        render: null,          // the original bar visual in descent.js
    },
    {
        id: 'christmas',
        label: 'Christmas',
        blurb: 'Lights climb the tree to the star',
        tierNames: ['Sprout', 'Tinsel', 'Bauble', 'Holly', 'Angel', 'Star'],
        colors: ['#8fa69a', '#c9d6e3', '#e5484d', '#4cc38a', '#f2a7c3', '#ffd36b'],
        zeroTitle: 'Bah humbug!',
        render: renderChristmas,
    },
    {
        id: 'disco',
        label: 'Disco',
        blurb: 'Mirror ball over the dance floor',
        tierNames: ['Wallflower', 'Two-Step', 'Groove', 'Boogie', 'Fever', 'Disco Inferno'],
        colors: ['#6d5a8f', '#9b6cff', '#3ce7ff', '#38f0a0', '#ff4fb8', '#ffd36b'],
        zeroTitle: 'Party’s over!',
        render: renderDisco,
    },
];

// Seasonal settings — set for the Christmas launch. After Christmas, change
// both back to 'classic'.
// DEFAULT_THEME: what new games start on, and what games with no theme
// saved (made before themes existed) are shown in.
// SITE_THEME: how pages outside a game look (home, sign-in, create, admin).
export const DEFAULT_THEME = 'christmas';
export const SITE_THEME = 'christmas';

export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

export const themeOf = game => themeById(game?.theme || DEFAULT_THEME);
