// The scene shown after each answer. Themed games draw their own scene (see
// js/themes/); Classic games get a six-step gauge that fills down to the tier
// reached.
import { TIERS } from './tiers.js';
import { themeById } from './themes/index.js';

// tier: 0 for an answer that didn't count, otherwise 1-6.
export function renderDescent(container, tier, theme = themeById('classic')) {
    if (theme.render) {
        container.innerHTML = `<div class="theme-stage stage-${theme.id}" aria-label="${tier ? `Tier ${tier} of 6` : 'No points'}"></div>`;
        theme.render(container.firstElementChild, tier, { names: theme.tierNames, colors: theme.colors });
        return;
    }

    container.innerHTML = `
        <div class="descent" aria-label="${tier ? `Tier ${tier} of 6` : 'No points'}">
            ${TIERS.map(t => `
                <div class="descent-step" data-tier="${t.tier}">
                    <span class="descent-name">${t.name}</span>
                    <span class="descent-points">${t.points}</span>
                </div>
            `).join('')}
        </div>
    `;
    const steps = container.querySelectorAll('.descent-step');
    // Light the steps one at a time so it reads as going deeper.
    steps.forEach((step, i) => {
        if (i < tier) setTimeout(() => step.classList.add('reached'), 120 * (i + 1));
    });
    if (tier) setTimeout(() => steps[tier - 1].classList.add('landed'), 120 * tier + 80);
}
