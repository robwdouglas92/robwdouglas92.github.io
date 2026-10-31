// Christmas theme: a string of old-fashioned bulbs zig-zags up the tree, one
// run per tier, and only a top-tier answer lights the star. No score: the
// first bulb fuses and the star droops.
import {
    fitCanvas, animate, reducedMotion, rand, starShape, burst, stepSparks, makeSnow, drawSnow,
} from './fx.js';

const GOLD = '#ffd36b';
const RED = '#e5484d';
const BULBS = [RED, GOLD, '#4cc38a', '#5ab0ff', '#f2a7c3'];
const DIM_LABEL = '#3d5671';
const LABEL_FONT = "700 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function buildTree(w, h) {
    const cx = w * 0.42;
    const starY = 30;
    const top = starY + 10;
    const base = h - 46;
    const maxHalf = w * 0.36;
    const halfAt = y => maxHalf * Math.pow(Math.max(0, (y - top) / (base - top)), 0.92);

    // Seven overlapping layers of branches, each with a ragged lower edge.
    const fronds = Array.from({ length: 7 }, (_, k) => {
        const yBottom = top + (base - top) * ((k + 1) / 7) + 6;
        const yTop = k === 0 ? top : top + (base - top) * (k / 7) - (base - top) * 0.09;
        const half = halfAt(yBottom) * 1.04;
        const teeth = 6 + k * 2;
        const edge = Array.from({ length: teeth + 1 }, (_, t) => ({
            x: cx - half + (2 * half * t) / teeth,
            y: yBottom - (t % 2 ? rand(5, 9) : rand(-2, 2)) - Math.sin((t / teeth) * Math.PI) * 4,
        }));
        return { yTop, yBottom, half, edge };
    });

    const needles = [];
    while (needles.length < 520) {
        const y = rand(top + 8, base);
        const hw = halfAt(y) * 0.95;
        const x = cx + rand(-hw, hw);
        const a = (x < cx ? -1 : 1) * rand(0.35, 0.9) + Math.PI / 2;
        needles.push({ x, y, a, len: rand(3, 7), shade: rand(0, 1) });
    }

    // Six runs of bulbs, one per tier, alternating direction across the tree.
    const bands = Array.from({ length: 7 }, (_, i) => base - 10 - ((base - 10 - (top + 34)) * i) / 6);
    const runs = [];
    for (let i = 1; i <= 6; i++) {
        const y0 = bands[i - 1];
        const y1 = bands[i];
        const fromLeft = i % 2 === 1;
        const n = Math.max(3, Math.round(halfAt((y0 + y1) / 2) / 13));
        const pathAt = f => {
            const y = y0 + (y1 - y0) * f;
            const hw = halfAt(y) * 0.86;
            return { x: cx + (fromLeft ? -1 + 2 * f : 1 - 2 * f) * hw, y: y + Math.sin(f * Math.PI) * 7 };
        };
        const bulbs = Array.from({ length: n }, (_, j) => ({
            ...pathAt((j + 0.5) / n), tier: i, c: BULBS[(i * 2 + j) % BULBS.length], p: Math.random() * 6.28, tilt: rand(-0.35, 0.35),
        }));
        runs.push({ tier: i, pathAt, bulbs, labelY: (y0 + y1) / 2 });
    }

    const presents = [
        { x: cx - maxHalf * 0.95, w: 34, h: 24, c: RED, r: GOLD },
        { x: cx - 12, w: 26, h: 18, c: '#2f6fd6', r: '#ffffff' },
        { x: cx + maxHalf * 0.45, w: 30, h: 28, c: '#4cc38a', r: RED },
    ];
    return { w, cx, starY, top, base, maxHalf, fronds, needles, runs, presents };
}

function drawTreeBody(ctx, T, glow) {
    if (glow > 0) {
        const g = ctx.createRadialGradient(T.cx, (T.top + T.base) / 2, 10, T.cx, (T.top + T.base) / 2, T.maxHalf * 1.6);
        g.addColorStop(0, `rgba(255, 200, 120, ${0.12 * glow})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, T.w, T.base + 40);
    }
    ctx.fillStyle = '#4a2f1d';
    ctx.fillRect(T.cx - 8, T.base - 6, 16, 22);
    T.fronds.forEach((F, k) => {
        const last = F.edge[F.edge.length - 1];
        const grad = ctx.createLinearGradient(T.cx - F.half, 0, T.cx + F.half, 0);
        grad.addColorStop(0, '#0f3322');
        grad.addColorStop(0.55, k % 2 ? '#1d5c3b' : '#1a5636');
        grad.addColorStop(1, '#2b7a4e');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(T.cx, F.yTop);
        ctx.quadraticCurveTo(T.cx + F.half * 0.5, F.yTop + (F.yBottom - F.yTop) * 0.55, last.x, last.y);
        for (let t = F.edge.length - 2; t >= 0; t--) ctx.lineTo(F.edge[t].x, F.edge[t].y);
        ctx.quadraticCurveTo(T.cx - F.half * 0.5, F.yTop + (F.yBottom - F.yTop) * 0.55, T.cx, F.yTop);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.beginPath();
        ctx.moveTo(F.edge[0].x, F.edge[0].y);
        F.edge.forEach(p => ctx.lineTo(p.x, p.y + 6));
        ctx.lineTo(last.x, last.y);
        ctx.fill();
    });
    ctx.lineWidth = 1;
    for (const n of T.needles) {
        ctx.strokeStyle = n.shade > 0.6 ? 'rgba(120, 200, 140, 0.35)' : 'rgba(5, 30, 18, 0.45)';
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(n.x + Math.cos(n.a) * n.len, n.y + Math.sin(n.a) * n.len);
        ctx.stroke();
    }
    for (const p of T.presents) {
        const y = T.base + 16 - p.h;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, y, p.w, p.h);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(p.x + p.w * 0.6, y, p.w * 0.4, p.h);
        ctx.fillStyle = p.r;
        ctx.fillRect(p.x + p.w / 2 - 2, y, 4, p.h);
        ctx.fillRect(p.x, y + p.h / 2 - 2, p.w, 4);
        ctx.beginPath();
        ctx.ellipse(p.x + p.w / 2 - 5, y - 3, 5, 3, -0.5, 0, Math.PI * 2);
        ctx.ellipse(p.x + p.w / 2 + 5, y - 3, 5, 3, 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWire(ctx, T) {
    ctx.strokeStyle = '#13261c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    T.runs.forEach((r, k) => {
        for (let s = 0; s <= 24; s++) {
            const p = r.pathAt(s / 24);
            if (k === 0 && s === 0) ctx.moveTo(p.x, p.y - 3);
            else ctx.lineTo(p.x, p.y - 3);
        }
    });
    ctx.lineTo(T.cx, T.starY + 14);
    ctx.stroke();
}

function drawBulb(ctx, b, on, landing, now) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.tilt);
    ctx.fillStyle = '#26352c';
    ctx.fillRect(-2.6, -3, 5.2, 5);
    ctx.globalAlpha = on ? 0.7 + 0.3 * Math.sin(now / (landing ? 90 : 320) + b.p) : 1;
    if (on) {
        ctx.shadowColor = b.c;
        ctx.shadowBlur = landing ? 20 : 12;
    }
    ctx.fillStyle = on ? b.c : '#1c2a24';
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.quadraticCurveTo(-5, 8, 0, 13);
    ctx.quadraticCurveTo(5, 8, 4, 2);
    ctx.closePath();
    ctx.fill();
    if (on) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-1.3, 5.5, 1, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawLabels(ctx, T, names, colors, litUpTo) {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    T.runs.forEach(r => {
        ctx.fillStyle = r.tier <= litUpTo ? colors[r.tier - 1] : DIM_LABEL;
        ctx.fillText(names[r.tier - 1].toUpperCase(), T.w * 0.83, r.labelY + 4);
    });
}

function drawStar(ctx, T, lit, now, droop = 0) {
    ctx.save();
    if (lit > 0) {
        const glow = ctx.createRadialGradient(T.cx, T.starY, 0, T.cx, T.starY, 80 * lit);
        glow.addColorStop(0, 'rgba(255, 211, 107, 0.6)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(T.cx, T.starY, 80 * lit, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 230, 160, ${0.5 * lit})`;
        ctx.lineWidth = 2;
        for (let r = 0; r < 10; r++) {
            const a = now / 2200 + (r * Math.PI) / 5;
            ctx.beginPath();
            ctx.moveTo(T.cx + Math.cos(a) * 22, T.starY + Math.sin(a) * 22);
            ctx.lineTo(T.cx + Math.cos(a) * (34 + 20 * lit), T.starY + Math.sin(a) * (34 + 20 * lit));
            ctx.stroke();
        }
    }
    // Droop pivots around the tip of the tree.
    ctx.translate(T.cx, T.starY + 14);
    ctx.rotate(droop);
    starShape(ctx, 0, -14, 19, 8);
    const fill = ctx.createLinearGradient(0, -33, 0, 5);
    fill.addColorStop(0, lit > 0 ? '#fff2c4' : '#4a5668');
    fill.addColorStop(1, lit > 0 ? GOLD : '#2c3646');
    ctx.fillStyle = fill;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 26 * lit;
    ctx.fill();
    ctx.restore();
}

export function renderChristmas(stage, tier, { names, colors }) {
    stage.innerHTML = '<canvas class="theme-canvas"></canvas>';
    const canvas = stage.querySelector('canvas');
    const { ctx, w, h } = fitCanvas(canvas);
    const T = buildTree(w, h);
    const snow = makeSnow(w, h, 60);
    const bulbs = T.runs.flatMap(r => r.bulbs);
    const reduced = reducedMotion();
    if (tier === 0) return fused(canvas, ctx, w, h, T, snow, bulbs, names, colors, reduced);

    // How many bulbs each tier finishes on, so labels light as their run completes.
    const ends = [];
    T.runs.reduce((n, r) => { ends.push(n + r.bulbs.length); return n + r.bulbs.length; }, 0);
    const target = ends[tier - 1];
    const stepMs = reduced ? 0 : 85;
    let sparks = [];
    let landed = false;
    let starLit = 0;

    animate(canvas, (t, dt, now) => {
        const litCount = stepMs ? Math.min(target, Math.floor(t / stepMs)) : target;
        ctx.clearRect(0, 0, w, h);
        drawSnow(ctx, snow, w, h, dt, now, tier === 6 && landed ? GOLD : null);
        drawTreeBody(ctx, T, litCount / bulbs.length);
        drawWire(ctx, T);
        bulbs.forEach((b, k) => drawBulb(ctx, b, k < litCount, landed && b.tier === tier, now));
        if (!landed && litCount > 0 && Math.random() < 0.5) {
            const b = bulbs[litCount - 1];
            sparks.push(...burst(1, b.x, b.y + 6, 4, 0.6, [b.c, '#ffffff']));
        }
        drawLabels(ctx, T, names, colors, ends.filter(e => litCount >= e).length);

        if (!landed && litCount >= target) {
            landed = true;
            const mid = T.runs[tier - 1].pathAt(0.5);
            sparks.push(...burst(10 + tier * 6, mid.x, mid.y, T.maxHalf, 2, [colors[tier - 1], GOLD, '#ffffff']));
        }
        if (tier === 6 && landed) {
            const before = starLit;
            starLit = Math.min(1, starLit + 0.05 * dt);
            if (before === 0) sparks.push(...burst(130, T.cx, T.starY, 20, 4, [GOLD, '#ffffff', RED, '#4cc38a']));
        }
        drawStar(ctx, T, starLit, now);
        sparks = stepSparks(ctx, sparks, dt, 0.05);
    });
}

// No score: the first bulb splutters and pops, and the star droops.
function fused(canvas, ctx, w, h, T, snow, bulbs, names, colors, reduced) {
    const first = bulbs[0];
    const popAt = reduced ? 0 : 1300;
    let popped = reduced;
    let sparks = [];
    let smoke = [];

    animate(canvas, (t, dt, now) => {
        ctx.clearRect(0, 0, w, h);
        drawSnow(ctx, snow, w, h, dt, now);
        drawTreeBody(ctx, T, 0);
        drawWire(ctx, T);
        bulbs.forEach((b, k) => { if (k) drawBulb(ctx, b, false, false, now); });

        if (!popped) {
            const flickering = t > 250 && Math.sin(t / 35) * Math.sin(t / 91) > -0.1;
            drawBulb(ctx, first, flickering, false, now);
            if (t >= popAt) {
                popped = true;
                sparks.push(...burst(26, first.x, first.y + 6, 6, 2.6, ['#ffffff', GOLD, '#ffb347']));
                smoke = Array.from({ length: 9 }, () => ({
                    x: first.x + rand(-4, 4), y: first.y + 4, r: rand(4, 8), vy: rand(-0.5, -0.25), vx: rand(-0.25, 0.25), life: 1,
                }));
            }
        } else {
            drawBulb(ctx, first, false, false, now);
            ctx.save();
            ctx.translate(first.x, first.y);
            ctx.rotate(first.tilt);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(0, 8, 3, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(220,230,240,0.7)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-3, 4); ctx.lineTo(0, 7); ctx.lineTo(-1, 9); ctx.lineTo(2, 12);
            ctx.stroke();
            ctx.restore();
        }
        if (popped && !reduced && t - popAt < 120) {
            ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - (t - popAt) / 120)})`;
            ctx.fillRect(0, 0, w, h);
        }
        for (const s of smoke) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.r += 0.08 * dt;
            s.life -= 0.006 * dt;
            if (s.life <= 0) continue;
            ctx.fillStyle = `rgba(150,160,170,${0.35 * s.life})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        drawLabels(ctx, T, names, colors, 0);
        const droop = popped ? Math.max(0, Math.min(0.55, reduced ? 0.55 : (t - popAt - 400) / 2500)) : 0;
        drawStar(ctx, T, 0, now, droop);
        sparks = stepSparks(ctx, sparks, dt, 0.08);
    });
}

