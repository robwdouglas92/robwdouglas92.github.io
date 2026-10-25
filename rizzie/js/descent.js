// The "how deep did that answer go" visual shown after each answer.
//
// Placeholder design: a six-step gauge that fills down to the tier reached.
// The final theme isn't chosen yet, so everything visual about it lives here
// (and in the .descent styles in index.html) — swapping the theme means
// replacing this one function, not touching the play screen.
import { TIERS } from './tiers.js';

// tier: 0 for an answer that didn't count, otherwise 1-6.
export function renderDescent(container, tier) {
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
