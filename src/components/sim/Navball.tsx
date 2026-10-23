import { useEffect, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { activeVehicle, type Flight } from '@/lib/aerospace';

export function Navball({ flightRef }: { flightRef: React.RefObject<Flight> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let raf = 0;
    const styles = getComputedStyle(document.documentElement);
    const color = (name: string) => styles.getPropertyValue(name).trim();
    const sky = color('--nav-sky'), ground = color('--nav-ground'), text = color('--foreground'), accent = color('--accent');
    const draw = () => {
      const size = 160, r = 65, cx = 80, cy = 80;
      canvas.width = canvas.height = 320; ctx.setTransform(2, 0, 0, 2, 0, 0);
      const v = activeVehicle(flightRef.current), q = v.attitude.clone().invert();
      ctx.clearRect(0, 0, size, size); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = sky; ctx.fillRect(0, 0, size, size);
      const up = new Vector3(0, 1, 0).applyQuaternion(q);
      const roll = Math.atan2(up.x, up.y), pitch = Math.asin(Math.min(1, Math.max(-1, up.z)));
      ctx.translate(cx, cy); ctx.rotate(-roll); ctx.fillStyle = ground; ctx.fillRect(-100, pitch * r, 200, 200);
      ctx.strokeStyle = text; ctx.lineWidth = 1; ctx.globalAlpha = 0.65;
      for (let deg = -60; deg <= 60; deg += 15) {
        const y = pitch * r + deg / 90 * r;
        ctx.beginPath(); ctx.moveTo(deg === 0 ? -90 : -22, y); ctx.lineTo(deg === 0 ? 90 : 22, y); ctx.stroke();
        if (deg !== 0) { ctx.font = '9px monospace'; ctx.fillStyle = text; ctx.fillText(String(-deg), 28, y + 3); }
      }
      ctx.restore(); ctx.strokeStyle = text; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18; ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * 69, cy + Math.cos(a) * 69); ctx.lineTo(cx + Math.sin(a) * (i % 3 ? 72 : 75), cy + Math.cos(a) * (i % 3 ? 72 : 75)); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(42, 80); ctx.lineTo(67, 80); ctx.lineTo(73, 86); ctx.moveTo(87, 86); ctx.lineTo(93, 80); ctx.lineTo(118, 80); ctx.stroke();
      ctx.beginPath(); ctx.arc(80, 80, 3, 0, Math.PI * 2); ctx.stroke();
      if (v.v.length() > 1) { const dir = v.v.clone().normalize().applyQuaternion(q); ctx.strokeStyle = color('--success'); ctx.beginPath(); ctx.arc(cx + dir.x * 48, cy - dir.y * 48, 5, 0, Math.PI * 2); ctx.stroke(); }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [flightRef]);
  return <canvas ref={ref} className="navball" aria-label="Sztuczny horyzont · orientacja rakiety" />;
}