import { useEffect, useRef } from "react";
import { BODIES, KARMAN, type Config, type SimState } from "@/lib/rocket-physics";

interface Particle { x: number; y: number; vx: number; vy: number; life: number; }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function FlightCanvas({ stateRef, config }: { stateRef: React.RefObject<SimState>; config: Config }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const stars = Array.from({ length: 180 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3 }));
    const particles: Particle[] = [];
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, hgt = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = stateRef.current!;
      const c = cfgRef.current;
      const body = BODIES[c.body];

      // sky
      const t = Math.min(1, s.h / KARMAN);
      const [r0, g0, b0] = body.skyLow;
      const top = `rgb(${lerp(r0 * 0.6, 3, t)},${lerp(g0 * 0.6, 4, t)},${lerp(b0 * 0.7, 12, t)})`;
      const bot = `rgb(${lerp(r0, 6, t)},${lerp(g0, 8, t)},${lerp(b0, 20, t)})`;
      const grad = ctx.createLinearGradient(0, 0, 0, hgt);
      grad.addColorStop(0, top); grad.addColorStop(1, bot);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, hgt);

      // stars
      const starAlpha = body.rho0 === 0 ? 1 : Math.min(1, Math.max(0, (s.h - 20000) / 70000));
      const scroll = (s.h / 50) % hgt;
      ctx.fillStyle = `rgba(255,255,255,${starAlpha})`;
      for (const st of stars) {
        const y = (st.y * hgt + scroll) % hgt;
        ctx.beginPath(); ctx.arc(st.x * w, y, st.r, 0, Math.PI * 2); ctx.fill();
      }

      // camera: rocket rises to 60% of height, then stays fixed
      const groundBase = hgt - 50;
      const pxPerM = 2;
      const rocketYNoCam = groundBase - s.h * pxPerM;
      const rocketY = Math.max(hgt * 0.45, rocketYNoCam);
      const camOffset = rocketY - rocketYNoCam;
      const groundY = groundBase + camOffset;
      const cx = w / 2;

      // altitude ticks
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillStyle = "rgba(120,220,255,0.55)";
      const tickStep = s.h > 20000 ? 10000 : s.h > 2000 ? 1000 : 100;
      const base = Math.floor(s.h / tickStep) * tickStep;
      for (let k = -3; k <= 6; k++) {
        const alt = base + k * tickStep;
        if (alt < 0) continue;
        const y = rocketY - (alt - s.h) * (tickStep === 100 ? pxPerM : (hgt * 0.15) / tickStep);
        if (y < 0 || y > hgt) continue;
        ctx.fillRect(w - 40, y, 12, 1);
        ctx.fillText(alt >= 1000 ? `${alt / 1000} km` : `${alt} m`, w - 100, y + 4);
      }

      // ground + pad
      if (groundY < hgt + 10) {
        ctx.fillStyle = body.ground; ctx.fillRect(0, groundY, w, hgt - groundY + 10);
        ctx.fillStyle = "#555b66"; ctx.fillRect(cx - 50, groundY - 6, 100, 6);
        ctx.fillStyle = "#3a3f48"; ctx.fillRect(cx - 70, groundY - 90, 8, 84);
      }

      // particles
      const burning = s.fuel > 0 && s.phase === "ascent";
      if (burning) {
        for (let i = 0; i < 6; i++) particles.push({ x: cx + (Math.random() - 0.5) * 10, y: rocketY + 4, vx: (Math.random() - 0.5) * 1.5, vy: 3 + Math.random() * 3, life: 1 });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.x += p.vx; p.y += p.vy; p.vx *= 1.02; p.life -= 0.035;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const hue = 20 + (1 - p.life) * 30;
        ctx.fillStyle = `hsla(${hue},100%,${50 + p.life * 30}%,${p.life})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (1 - p.life) * 7, 0, Math.PI * 2); ctx.fill();
      }

      // rocket
      if (s.phase !== "crash") {
        ctx.save(); ctx.translate(cx, rocketY);
        ctx.fillStyle = "#e8edf2"; ctx.fillRect(-9, -70, 18, 66);
        ctx.fillStyle = "#ff7a2a"; ctx.beginPath(); ctx.moveTo(-9, -70); ctx.lineTo(0, -92); ctx.lineTo(9, -70); ctx.fill();
        ctx.fillStyle = "#3fd3ff"; ctx.beginPath(); ctx.arc(0, -52, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#9aa4b0";
        ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(-18, -2); ctx.lineTo(-9, -6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(9, -20); ctx.lineTo(18, -2); ctx.lineTo(9, -6); ctx.fill();
        ctx.fillStyle = "#444"; ctx.fillRect(-6, -4, 12, 4);
        ctx.restore();
      } else {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = `rgba(255,${120 - i * 30},40,${0.5 - i * 0.12})`;
          ctx.beginPath(); ctx.arc(cx, groundY - 10, 20 + i * 15 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // apogee marker
      if (s.apogee > 0 && s.apogee > s.h + 1) {
        const ay = rocketY - (s.apogee - s.h) * (s.h > 2000 ? (hgt * 0.15) / tickStep : pxPerM);
        if (ay > 0) {
          ctx.strokeStyle = "rgba(60,230,170,0.8)"; ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(w, ay); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "rgba(60,230,170,0.95)";
          ctx.fillText(`APOGEUM ${(s.apogee / 1000).toFixed(2)} km`, 12, ay - 6);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stateRef]);

  return <canvas ref={canvasRef} className="h-full w-full block" />;
}
