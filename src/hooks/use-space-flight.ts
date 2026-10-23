import { useEffect, useRef, useState } from 'react';
import { activeVehicle, addEvent, advanceFlight, makeFlight, separate, telemetry, DEFAULT_CONFIG, type AerospaceConfig, type CameraMode, type Mode, type PilotInput } from '@/lib/aerospace';
import { SpaceAudio } from '@/lib/space-audio';

export type FlightSample = { t: number; h: number; v: number; q: number; temp: number };
export function useSpaceFlight() {
  const [config, setConfig] = useState<AerospaceConfig>(DEFAULT_CONFIG);
  const flightRef = useRef(makeFlight(DEFAULT_CONFIG));
  const configRef = useRef(config); configRef.current = config;
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<FlightSample[]>([]);
  const [speed, setSpeed] = useState(1); const speedRef = useRef(speed); speedRef.current = speed;
  const [muted, setMuted] = useState(true); const audioRef = useRef<SpaceAudio | null>(null);
  const keys = useRef(new Set<string>()), touch = useRef({ pitch: 0, yaw: 0, roll: 0 });
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const update = () => setRevision(n => n + 1);
  const toggle = (name: 'legs' | 'fins' | 'brakes') => { const v = activeVehicle(flightRef.current); v[name] = !v[name]; update(); };
  const stage = () => { separate(flightRef.current, configRef.current); update(); };
  useEffect(() => {
    const held = keys.current;
    const codes = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyZ', 'KeyX', 'Space', 'KeyG', 'KeyF', 'KeyB'];
    const down = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement && (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable)) return;
      if (!codes.includes(e.code)) return; e.preventDefault(); held.add(e.code);
      if (e.repeat) return;
      const f = flightRef.current, v = activeVehicle(f);
      if (e.code === 'KeyZ') v.throttle = 1;
      if (e.code === 'KeyX') { v.throttle = 0; addEvent(f, 'MECO · odcięcie silników'); }
      if (e.code === 'Space') separate(f, configRef.current);
      if (e.code === 'KeyG') v.legs = !v.legs;
      if (e.code === 'KeyF') v.fins = !v.fins;
      if (e.code === 'KeyB') v.brakes = !v.brakes;
      update();
    };
    const up = (e: KeyboardEvent) => held.delete(e.code);
    const clear = () => held.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  useEffect(() => {
    let raf = 0, last = performance.now(), uiTime = 0, sampleTime = -1;
    const loop = (now: number) => {
      const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      const f = flightRef.current, k = keys.current;
      const input: PilotInput = {
        pitch: Number(k.has('KeyW')) - Number(k.has('KeyS')) + touch.current.pitch,
        yaw: Number(k.has('KeyD')) - Number(k.has('KeyA')) + touch.current.yaw,
        roll: Number(k.has('KeyE')) - Number(k.has('KeyQ')) + touch.current.roll,
        throttle: Number(k.has('ShiftLeft') || k.has('ShiftRight')) - Number(k.has('ControlLeft') || k.has('ControlRight')),
      };
      if (f.running) {
        const dt = realDt * speedRef.current, sub = Math.ceil(dt / 0.01);
        for (let i = 0; i < sub; i++) advanceFlight(f, configRef.current, dt / sub, input);
      }
      const v = activeVehicle(f), m = telemetry(f, configRef.current);
      audioRef.current?.update(f.running && v.fuel > 0 ? v.throttle : 0, m.mach, f.running && (m.q > configRef.current.structuralLimit * 0.9 || v.fuel < 5000), f.running ? v.rcs : 0);
      if (now - uiTime > 120) {
        uiTime = now; update();
        if (f.running && f.t - sampleTime >= 0.5) {
          sampleTime = f.t;
          setHistory(h => [...h, { t: +f.t.toFixed(1), h: +(m.altitude / 1000).toFixed(3), v: +m.speed.toFixed(1), q: +m.q.toFixed(2), temp: +v.temperature.toFixed(1) }].slice(-360));
        }
        if (!f.launched) sampleTime = -1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); audioRef.current?.dispose(); };
  }, []);
  const configure = <K extends keyof AerospaceConfig>(key: K, value: AerospaceConfig[K]) => {
    if (flightRef.current.launched && !['day', 'target'].includes(key)) return;
    const next = { ...configRef.current, [key]: value }; configRef.current = next; setConfig(next);
    if (!flightRef.current.launched) flightRef.current = makeFlight(next); update();
  };
  const startPause = () => {
    const f = flightRef.current;
    if (['rud', 'crash', 'landed'].includes(activeVehicle(f).phase)) return;
    f.running = !f.running;
    if (!f.launched) { f.launched = true; addEvent(f, 'Zapłon silników · sekwencja startowa', 'success'); }
    if (audioRef.current) audioRef.current.init(); update();
  };
  const reset = () => { flightRef.current = makeFlight(configRef.current); setHistory([]); update(); };
  const setMode = (mode: Mode) => { const f = flightRef.current; activeVehicle(f).mode = mode; activeVehicle(f).integral.set(0, 0, 0); addEvent(f, `Autopilot: ${mode.toUpperCase()}`); update(); };
  const setThrottle = (value: number) => { activeVehicle(flightRef.current).throttle = value; update(); };
  const selectStage = (id: 'booster' | 'upper') => { if (id === 'upper' && !flightRef.current.upper) return; flightRef.current.active = id; update(); };
  const toggleSound = () => {
    if (!audioRef.current) audioRef.current = new SpaceAudio();
    audioRef.current.init(); audioRef.current.setMuted(!muted); setMuted(!muted);
  };
  void revision;
  const flight = flightRef.current, vehicle = activeVehicle(flight), metrics = telemetry(flight, config);
  return { config, configure, flightRef, flight, vehicle, metrics, history, speed, setSpeed, muted, toggleSound, startPause, reset, setMode, setThrottle, selectStage, stage, toggle, cameraMode, setCameraMode, touch };
}