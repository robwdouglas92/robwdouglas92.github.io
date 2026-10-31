// Disco theme: a mirror ball spins over a dance floor that lights up row by
// row, one row per tier, with a pair of spotlight beams for each row lit.
// No score: the ball's string snaps and it crashes onto the floor.
import { fitCanvas, animate, reducedMotion, pick, burst, stepSparks } from './fx.js';
import { esc } from '../utils/html.js';

const GOLD = '#ffd36b';
const SPARKLE = ['#ff4fb8', '#3ce7ff', GOLD, '#9b6cff', '#ffffff'];
const FIRST_LIGHT_MS = 400;
const ROW_MS = 280;

function drawMirrorBall(ctx, cx, cy, R, rot, gold, now, seed, withString = true) {
    if (withString) {
        ctx.strokeStyle = '#6b5a88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, cy - R);
        ctx.stroke();
    }
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    body.addColorStop(0, gold ? '#fff2c4' : '#e9e6f2');
    body.addColorStop(1, gold ? '#8a6110' : '#3a3150');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const LAT = 12;
    const LON = 20;
    let k = 0;
    for (let i = 0; i < LAT; i++) {
        const lat = -Math.PI / 2 + (i + 0.5) * Math.PI / LAT;
        for (let j = 0; j < LON; j++, k++) {
            const lon = (j / LON) * Math.PI * 2 + rot;
            const z = Math.cos(lat) * Math.cos(lon);
            if (z <= 0) continue;
            const x = cx + R * Math.cos(lat) * Math.sin(lon);
            const y = cy + R * Math.sin(lat);
            const fw = (R * Math.PI / LON) * Math.cos(lat) * z * 1.8;
            const fh = R * Math.PI / LAT * Math.cos(lat) * 0.8;
            const bright = 0.25 + 0.75 * z * (0.5 + 0.5 * Math.sin(now / 180 + seed[k % seed.length] * 40));
            ctx.fillStyle = gold
                ? `rgba(255, ${190 + 60 * bright | 0}, ${90 * bright | 0}, ${0.35 + bright * 0.6})`
                : `rgba(${200 + 55 * bright | 0}, ${200 + 55 * bright | 0}, 255, ${0.25 + bright * 0.65})`;
            ctx.fillRect(x - fw / 2, y - fh / 2, Math.max(1, fw - 1), Math.max(1, fh - 1));
        }
    }
    ctx.restore();
}

export function renderDisco(stage, tier, { names, colors }) {
    stage.innerHTML = `
        <div class="disco-floor">
            ${names.map((name, i) => `
                <div class="df-row" data-row="${i + 1}" style="--c:${colors[i]}">
                    <span class="df-label">${esc(name)}</span>
                    ${'<span class="df-tile"></span>'.repeat(5)}
                </div>`).reverse().join('')}
        </div>
        <canvas class="theme-canvas"></canvas>
    `;
    const floor = stage.querySelector('.disco-floor');
    const canvas = stage.querySelector('canvas');
    const { ctx, w, h } = fitCanvas(canvas);
    const stageTop = canvas.getBoundingClientRect().top;
    const rowY = i => {
        const r = floor.querySelector(`[data-row="${i}"]`).getBoundingClientRect();
        return (r.top + r.bottom) / 2 - stageTop;
    };
    const floorRect = floor.getBoundingClientRect();
    const floorTop = floorRect.top - stageTop;
    const floorBottom = floorRect.bottom - stageTop;
    const cx = w * 0.5;
    const R = Math.min(w, h) * 0.11;
    const cy = R + 16;
    const seed = Array.from({ length: 400 }, () => Math.random());
    const reduced = reducedMotion();
    if (tier === 0) return crash({ canvas, ctx, w, h, floor, cx, R, hangY: cy, restY: rowY(1) - R * 0.45, seed, reduced });

    const gold = tier === 6;
    const lightAt = i => (reduced ? 0 : FIRST_LIGHT_MS + ROW_MS * (i - 1));
    let litTo = 0;
    let sparks = [];
    let rot = 0;

    animate(canvas, (t, dt, now) => {
        // Light rows as their time comes.
        while (litTo < tier && t >= lightAt(litTo + 1)) {
            litTo++;
            const row = floor.querySelector(`[data-row="${litTo}"]`);
            row.classList.add('lit');
            if (litTo === tier) {
                row.classList.add('landed');
                sparks.push(...burst(gold ? 170 : 10 + tier * 7, cx, rowY(litTo), w * 0.7, gold ? 3.6 : 2.2, SPARKLE));
                if (gold) floor.querySelectorAll('.df-row').forEach(r => r.classList.add('lit'));
            }
        }
        rot += 0.012 * dt;
        ctx.clearRect(0, 0, w, h);

        // Spotlight beams ending in pools of light that sweep across the floor.
        const beams = Math.max(2, litTo * 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < beams; i++) {
            const tx = cx + Math.sin(now / 900 + i * 1.7) * w * 0.42;
            const ty = floorTop + (floorBottom - floorTop) * (0.15 + 0.8 * ((i * 0.37 + now / 4000) % 1));
            const col = gold && litTo === 6 ? GOLD : SPARKLE[i % 4];
            const half = 10 + (ty - cy) * 0.06;
            const beam = ctx.createLinearGradient(cx, cy, tx, ty);
            beam.addColorStop(0, col);
            beam.addColorStop(1, 'transparent');
            ctx.globalAlpha = 0.18 + litTo * 0.03;
            ctx.fillStyle = beam;
            ctx.beginPath();
            ctx.moveTo(cx - 3, cy);
            ctx.lineTo(tx - half, ty);
            ctx.lineTo(tx + half, ty);
            ctx.lineTo(cx + 3, cy);
            ctx.closePath();
            ctx.fill();
            const pool = ctx.createRadialGradient(tx, ty, 0, tx, ty, half * 1.6);
            pool.addColorStop(0, col);
            pool.addColorStop(1, 'transparent');
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = pool;
            ctx.beginPath();
            ctx.ellipse(tx, ty, half * 1.6, half * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        drawMirrorBall(ctx, cx, cy, R, rot, gold && litTo === 6, now, seed);

        if (Math.random() < 0.1 + litTo * 0.03) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * R * 0.8;
            sparks.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0, life: 0.6, size: 5 + Math.random() * 5, color: '#ffffff' });
        }
        if (Math.random() < litTo * 0.05) sparks.push(...burst(1, cx, cy + R, R * 2, 1, SPARKLE));
        if (gold && litTo === 6 && Math.random() < 0.6) {
            sparks.push({ x: Math.random() * w, y: -10, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.5, life: 1.5, size: 3 + Math.random() * 4, color: pick(SPARKLE) });
        }
        sparks = stepSparks(ctx, sparks, dt, 0.035);
    });
}

// No score: the string snaps, the ball drops onto the floor, bounces and
// cracks, and the front row of tiles flashes red and dies.
function crash({ canvas, ctx, w, h, floor, cx, R, hangY, restY, seed, reduced }) {
    const front = floor.querySelector('[data-row="1"]');
    const snapAt = reduced ? 0 : 900;
    let phase = reduced ? 'rest' : 'spin';
    let y = reduced ? restY : hangY;
    let vy = 0;
    let rot = 0;
    let bounces = 0;
    let cracked = reduced;
    let tilt = 0;
    let sparks = [];
    if (reduced) front.classList.add('fused');

    animate(canvas, (t, dt, now) => {
        ctx.clearRect(0, 0, w, h);
        if (phase === 'spin') {
            rot += 0.012 * dt;
            if (Math.sin(t / 60) > 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.12;
                ctx.fillStyle = SPARKLE[0];
                ctx.beginPath();
                ctx.moveTo(cx, y);
                ctx.lineTo(cx - 60, h);
                ctx.lineTo(cx - 30, h);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            if (t >= snapAt) {
                phase = 'fall';
                sparks.push(...burst(6, cx, hangY - R - 4, 4, 1, ['#ffffff']));
            }
        } else if (phase === 'fall') {
            rot += 0.004 * dt;
            vy += 0.55 * dt;
            y += vy * dt;
            if (y >= restY) {
                y = restY;
                if (bounces === 0) {
                    cracked = true;
                    front.classList.add('fused');
                    sparks.push(...burst(34, cx, restY + R * 0.6, R * 1.6, 2.4, ['#ffffff', '#cfd3e6', '#9aa0b8']));
                }
                bounces++;
                vy = -vy * 0.32;
                tilt = (0.18 * (bounces % 2 ? 1 : -1)) / bounces;
                if (bounces >= 3 || Math.abs(vy) < 1) phase = 'rest';
            }
        }

        // What's left of the string, swinging from the ceiling.
        if (phase !== 'spin') {
            const swing = Math.sin(t / 260) * 10 * Math.max(0, 1 - (t - snapAt) / 4000);
            ctx.strokeStyle = '#6b5a88';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.quadraticCurveTo(cx, R, cx + swing, hangY - R - 6);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(tilt);
        ctx.translate(-cx, -y);
        drawMirrorBall(ctx, cx, y, R, rot, false, now, seed, phase === 'spin');
        if (cracked) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, y, R, 0, Math.PI * 2);
            ctx.clip();
            ctx.strokeStyle = 'rgba(20, 10, 35, 0.85)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(cx - R * 0.1, y - R); ctx.lineTo(cx + R * 0.15, y - R * 0.35); ctx.lineTo(cx - R * 0.05, y + R * 0.1);
            ctx.lineTo(cx + R * 0.3, y + R * 0.55); ctx.moveTo(cx + R * 0.15, y - R * 0.35); ctx.lineTo(cx + R * 0.7, y - R * 0.2);
            ctx.moveTo(cx - R * 0.05, y + R * 0.1); ctx.lineTo(cx - R * 0.6, y + R * 0.35);
            ctx.stroke();
            ctx.fillStyle = 'rgba(20, 10, 35, 0.9)';
            ctx.fillRect(cx + R * 0.2, y - R * 0.05, R * 0.22, R * 0.18);
            ctx.restore();
        }
        ctx.restore();
        if (phase === 'rest') tilt *= 0.96;
        sparks = stepSparks(ctx, sparks, dt, 0.09);
    });
}
