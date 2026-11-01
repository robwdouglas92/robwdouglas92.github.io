// Dresses the whole page in a game's theme while a player is inside that
// game: colours (via <body data-theme>, see index.html), the phone's status
// bar colour, and a gentle ambient layer behind everything — falling snow
// for Christmas, twinkling sparkles and drifting light for Disco.
import { fitCanvas, reducedMotion, sparkle, makeSnow, drawSnow, pick, rand } from './fx.js';

const STATUS_BAR = { classic: '#1d4d3a', christmas: '#0c1828', disco: '#110a1c' };
const DISCO_COLORS = ['#ff4fb8', '#3ce7ff', '#ffd36b', '#9b6cff'];

let current = 'classic';
let canvas = null;
let frameId = 0;

export function setPageTheme(id = 'classic') {
    if (id === current) return;
    current = id;
    if (id === 'classic') delete document.body.dataset.theme;
    else document.body.dataset.theme = id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR[id] || STATUS_BAR.classic);
    startAmbient(id);
}

function startAmbient(id) {
    cancelAnimationFrame(frameId);
    canvas?.remove();
    canvas = null;
    if (id === 'classic') return;

    canvas = document.createElement('canvas');
    canvas.className = 'ambient';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    let { ctx, w, h } = fitCanvas(canvas);
    const scene = id === 'christmas' ? snowScene(w, h) : discoScene(w, h);
    const still = reducedMotion();

    // Re-size with the window (and the phone keyboard opening and closing).
    const mine = canvas;
    let resizeTimer;
    window.addEventListener('resize', function onResize() {
        if (canvas !== mine) return window.removeEventListener('resize', onResize);
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => ({ ctx, w, h } = fitCanvas(mine)), 150);
    });

    let last = performance.now();
    const tick = now => {
        if (canvas !== mine) return;
        const dt = still ? 0 : Math.min(3, (now - last) / 16.7);
        last = now;
        ctx.clearRect(0, 0, w, h);
        scene(ctx, w, h, dt, now);
        if (!still) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
}

function snowScene(w, h) {
    const snow = makeSnow(w, h, Math.round((w * h) / 9000));
    return (ctx, cw, ch, dt, now) => drawSnow(ctx, snow, cw, ch, dt, now);
}

function discoScene(w, h) {
    const glints = Array.from({ length: Math.round((w * h) / 14000) }, () => ({
        x: rand(0, w), y: rand(0, h), c: pick(DISCO_COLORS), p: rand(0, 6.28), s: rand(2, 5), speed: rand(500, 1400),
    }));
    // Soft coloured spotlights wandering slowly across the room.
    const lights = DISCO_COLORS.map((c, i) => ({ c, p: i * 1.6 }));
    return (ctx, cw, ch, dt, now) => {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const l of lights) {
            const x = cw * (0.5 + 0.45 * Math.sin(now / 5200 + l.p));
            const y = ch * (0.5 + 0.4 * Math.cos(now / 6700 + l.p * 1.3));
            const r = Math.max(cw, ch) * 0.35;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, l.c);
            g.addColorStop(1, 'transparent');
            ctx.globalAlpha = 0.09;
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
        for (const g of glints) {
            const a = Math.max(0, Math.sin(now / g.speed + g.p));
            if (a > 0.05) sparkle(ctx, g.x, g.y, g.s * a, g.c, a * 0.8);
        }
    };
}
