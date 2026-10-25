import { fetchGame, fetchMyPlay, getSession, startPlay, startPrompt, saveAnswers } from '../api.js';
import { matchAnswer } from '../match.js';
import { TIERS, PROMPT_COUNT, PROMPT_SECONDS, tierInfo, pointsFor } from '../tiers.js';
import { renderDescent } from '../descent.js';
import { router } from '../router.js';
import { app, esc, showMessage } from '../utils/html.js';

const PROMPT_MS = PROMPT_SECONDS * 1000;

class PlayComponent {
    async load(gameId) {
        this.stop();
        this.gameId = gameId;
        [this.game, this.play] = await Promise.all([fetchGame(gameId), fetchMyPlay(gameId)]);
        this.answers = this.play?.answers ? [...this.play.answers] : [];
    }

    // Called on every route change so a running timer can't fire on another page.
    stop() {
        clearInterval(this.timer);
        this.timer = null;
    }

    render() {
        if (!this.game) {
            showMessage('Game not found', 'This game doesn’t exist, or has been removed.');
            return;
        }
        if (this.play?.status === 'complete') {
            router.navigate('results', { id: this.gameId });
            return;
        }
        if (!this.play) {
            this.renderIntro();
            return;
        }

        // Resuming after a refresh or a closed tab. The timer kept running in
        // the meantime — it's measured from when the prompt started, not paused.
        const index = this.answers.length;
        if (index >= PROMPT_COUNT) {
            this.persist(saveAnswers(this.gameId, this.answers, true));
            router.navigate('results', { id: this.gameId });
            return;
        }
        if (this.play.currentIndex === index && this.play.currentStartedAt) {
            const deadline = this.play.currentStartedAt + PROMPT_MS;
            if (Date.now() >= deadline) {
                this.recordAnswer('', null, [], { timedOut: true });
            } else {
                this.renderReady(index, deadline);
            }
            return;
        }
        this.renderReady(index);
    }

    get total() {
        return this.answers.reduce((sum, a) => sum + a.points, 0);
    }

    renderIntro() {
        const mine = this.game.createdBy === getSession().id;
        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>${esc(this.game.title)}</h1>
                    <p class="subtitle">By ${esc(this.game.createdByName)}</p>
                </header>
                <div class="card">
                    <p><strong>${PROMPT_COUNT} prompts, ${PROMPT_SECONDS} seconds each.</strong>
                    If your answer isn’t on the list, keep trying until the clock runs out.
                    The fewer people who’d think of it, the more it scores.</p>
                    <ul class="tier-legend">
                        ${TIERS.map(t => `<li><span>${t.name}</span><span>${t.points} pts</span></li>`).join('')}
                    </ul>
                    <p class="hint">You only get one go, and the clock keeps running if you leave mid-prompt.</p>
                    ${mine ? '<p class="hint">This is your game, so your score is just for fun and won’t go on the leaderboard.</p>' : ''}
                </div>
                <button class="btn btn-primary btn-big" id="start">Start</button>
                <button class="btn btn-secondary" id="back">← Home</button>
            </div>
        `;
        document.getElementById('start').addEventListener('click', () => this.beginPrompt(0));
        document.getElementById('back').addEventListener('click', () => router.navigate('home'));
    }

    // Shown before each prompt so the timer only starts on a tap — that tap is
    // also what lets phones open the keyboard straight away.
    renderReady(index, resumeDeadline = null) {
        const secondsLeft = resumeDeadline ? Math.ceil((resumeDeadline - Date.now()) / 1000) : null;
        app().innerHTML = `
            <div class="container">
                <header>
                    <h1>${esc(this.game.title)}</h1>
                    <p class="subtitle">Prompt ${index + 1} of ${PROMPT_COUNT} · ${this.total} pts so far</p>
                </header>
                ${resumeDeadline ? `<div class="card"><p>You left in the middle of this prompt — about <strong>${secondsLeft} seconds</strong> left on the clock.</p></div>` : ''}
                <button class="btn btn-primary btn-big" id="go">${resumeDeadline ? 'Carry on' : `Prompt ${index + 1} →`}</button>
            </div>
        `;
        document.getElementById('go').addEventListener('click', () => this.beginPrompt(index, resumeDeadline));
    }

    beginPrompt(index, resumeDeadline = null) {
        if (resumeDeadline) {
            this.deadline = resumeDeadline;
        } else {
            this.deadline = Date.now() + PROMPT_MS;
            if (index === 0 && !this.play) {
                this.play = { currentIndex: 0 };
                this.persist(startPlay(this.gameId));
            } else {
                this.persist(startPrompt(this.gameId, index));
            }
        }
        this.renderPrompt(index);
    }

    renderPrompt(index) {
        const prompt = this.game.prompts[index];
        this.submitted = false;
        app().innerHTML = `
            <div class="container play">
                <div class="play-top">
                    <span>Prompt ${index + 1} of ${PROMPT_COUNT}</span>
                    <span>${this.total} pts</span>
                </div>
                <div class="timer"><div class="timer-fill" id="timer-fill"></div></div>
                <div class="timer-secs" id="timer-secs">${PROMPT_SECONDS}</div>
                <p class="prompt-text">${esc(prompt.text)}</p>
                <form id="answer-form" class="answer-form" autocomplete="off">
                    <input id="answer" type="text" maxlength="80" placeholder="Your answer"
                        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
                    <button class="btn btn-primary" type="submit">Go</button>
                </form>
                <p class="nope" id="nope" role="status"></p>
                <p class="save-error error" id="save-error"></p>
            </div>
        `;
        const input = document.getElementById('answer');
        const nope = document.getElementById('nope');
        // Rejected tries are kept so the creator can approve one later.
        const attempts = [];
        input.focus();

        // An answer that isn't on the list doesn't end the prompt: it's cleared
        // and you go again until one counts or the clock runs out. The page is
        // never re-rendered here, so the phone keyboard stays open.
        document.getElementById('answer-form').addEventListener('submit', e => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;
            const match = matchAnswer(text, prompt.answers);
            if (match) {
                this.recordAnswer(text, match, attempts);
                return;
            }
            attempts.push(text);
            input.value = '';
            input.focus();
            nope.textContent = `“${text}” isn’t on the list — try another!`;
            nope.classList.remove('shake');
            void nope.offsetWidth;   // restart the animation on repeat misses
            nope.classList.add('shake');
        });

        const fill = document.getElementById('timer-fill');
        const secs = document.getElementById('timer-secs');
        const tick = () => {
            const left = Math.max(0, this.deadline - Date.now());
            fill.style.width = `${(left / PROMPT_MS) * 100}%`;
            fill.classList.toggle('urgent', left <= 5000);
            secs.textContent = Math.ceil(left / 1000);
            if (left > 0) return;
            // Time's up: a half-typed answer still counts if it's on the list.
            const text = input.value.trim();
            const match = text ? matchAnswer(text, prompt.answers) : null;
            if (text && !match) attempts.push(text);
            this.recordAnswer(match ? text : '', match, attempts, { timedOut: true });
        };
        tick();
        this.stop();
        this.timer = setInterval(tick, 100);
    }

    recordAnswer(typed, match, attempts = [], { timedOut = false } = {}) {
        if (this.submitted) return;
        this.submitted = true;
        this.stop();

        const index = this.answers.length;
        const answer = {
            typed,
            matched: match ? match.name : null,
            tier: match ? match.tier : 0,
            points: match ? pointsFor(match.tier) : 0,
            attempts,
            timedOut,
        };
        this.answers.push(answer);
        const finished = this.answers.length === PROMPT_COUNT;
        this.persist(saveAnswers(this.gameId, this.answers, finished));
        this.renderFeedback(index, answer, finished);
    }

    renderFeedback(index, answer, finished) {
        const prompt = this.game.prompts[index];
        const info = tierInfo(answer.tier);
        let verdict;
        if (answer.matched) {
            verdict = `
                <p class="verdict-tier">${info.name}! <span class="plus">+${answer.points}</span></p>
                <p class="verdict-detail">Counted as <strong>${esc(answer.matched)}</strong></p>`;
        } else if (answer.attempts.length) {
            verdict = `
                <p class="verdict-tier">Out of time!</p>
                <p class="verdict-detail">None of your tries were on the list:
                    ${answer.attempts.map(a => `“${esc(a)}”`).join(', ')}.
                    ${esc(this.game.createdByName)} can review them later.</p>`;
        } else {
            verdict = '<p class="verdict-tier">Out of time!</p>';
        }

        app().innerHTML = `
            <div class="container">
                <div class="play-top">
                    <span>Prompt ${index + 1} of ${PROMPT_COUNT}</span>
                    <span>${this.total} pts</span>
                </div>
                <p class="prompt-text prompt-text-small">${esc(prompt.text)}</p>
                <div class="card verdict">${verdict}</div>
                <div id="descent"></div>
                <button class="btn btn-primary btn-big" id="next">${finished ? 'See results →' : 'Next prompt →'}</button>
                <p class="save-error error" id="save-error"></p>
            </div>
        `;
        renderDescent(document.getElementById('descent'), answer.tier);
        document.getElementById('next').addEventListener('click', () => {
            if (finished) router.navigate('results', { id: this.gameId });
            else this.beginPrompt(index + 1);
        });
    }

    persist(promise) {
        promise.catch(err => {
            console.error(err);
            const el = document.getElementById('save-error');
            if (el) el.textContent = 'Couldn’t save — check your connection. Your answers are kept on this screen for now.';
        });
    }
}

export const playComponent = new PlayComponent();
