// Shared canvas effects for the themed after-answer scenes: sizing,
// four-point sparkles, stars and falling snow.

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const rand = (a, b) => a + Math.random() * (b - a);

// Sizes a canvas to its box at the screen's pixel density.
export function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
}

// Runs frame(now, dt) every animation frame until the canvas leaves the page
// (the player moved on), so scenes never need explicit cleanup.
export function animate(canvas, frame) {
    let last = performance.now();
    const t0 = last;
    (function tick(now) {
        if (!canvas.isConnected) return;
        const dt = Math.min(3, (now - last) / 16.7);
        last = now;
        frame(now - t0, dt, now);
        requestAnimationFrame(tick);
    })(t0);
}

export function sparkle(ctx, x, y, size, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.quadraticCurveTo(x, y, x, y + size);
    ctx.quadraticCurveTo(x, y, x - size, y);
    ctx.quadraticCurveTo(x, y, x, y - size);
    ctx.fill();
    ctx.restore();
}

export function starShape(ctx, x, y, outer, inner, points = 5) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer;
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
}

export function burst(n, x, y, spread, speed, colors) {
    return Array.from({ length: n }, () => {
        const a = Math.random() * Math.PI * 2;
        const v = (0.4 + Math.random()) * speed;
        return {
            x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.4,
            vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35,
            life: 1, size: 3 + Math.random() * 5, color: pick(colors),
        };
    });
}

// Moves and draws sparks; returns the ones still alive.
export function stepSparks(ctx, sparks, dt, gravity) {
    for (const s of sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += gravity * dt;
        s.life -= 0.012 * dt;
        if (s.life > 0) sparkle(ctx, s.x, s.y, s.size * (0.6 + 0.4 * Math.sin(s.life * 20)), s.color, Math.min(1, s.life * 1.5));
    }
    return sparks.filter(s => s.life > 0);
}

export function makeSnow(w, h, n) {
    return Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.8, v: 0.25 + Math.random() * 0.5, p: Math.random() * 6.28,
    }));
}

export function drawSnow(ctx, snow, w, h, dt, now, glitterColor = null) {
    for (const f of snow) {
        f.y += f.v * dt;
        f.x += Math.sin(now / 1200 + f.p) * 0.2 * dt;
        if (f.y > h + 4) {
            f.y = -4;
            f.x = Math.random() * w;
        }
        if (glitterColor && Math.sin(now / 150 + f.p * 9) > 0.92) {
            sparkle(ctx, f.x, f.y, f.r * 3, glitterColor, 0.9);
        } else {
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}
