import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { FlightCanvas } from "@/components/sim/FlightCanvas";
import { BODIES, initialState, step, twr, type BodyId, type Config, type SimState } from "@/lib/rocket-physics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Symulator Startu Rakiety 2D — Mission Control" },
      { name: "description", content: "Skonfiguruj rakietę, wybierz Ziemię, Marsa lub Księżyc i obserwuj lot z telemetrią na żywo." },
      { property: "og:title", content: "Symulator Startu Rakiety 2D" },
      { property: "og:description", content: "Interaktywna fizyka startu rakiety z telemetrią na żywo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PHASE_LABEL: Record<string, string> = {
  pad: "Stoi na platformie",
  ascent: "Wznoszenie",
  coast: "Lot swobodny",
  descent: "Opadanie",
  crash: "Katastrofa",
  landed: "Lądowanie",
};

type Sample = { t: number; h: number; v: number };

function Index() {
  const [config, setConfig] = useState<Config>({ dryMass: 15000, fuelMass: 120000, thrustKN: 2500, burnRate: 500, dragCoef: 0.4, body: "earth" });
  const stateRef = useRef<SimState>(initialState(config));
  const [ui, setUi] = useState<SimState>(stateRef.current);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [history, setHistory] = useState<Sample[]>([]);
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const started = ui.t > 0;

  // Reset when config changes before launch
  useEffect(() => {
    if (!started) { stateRef.current = initialState(config); setUi(stateRef.current); }
  }, [config, started]);

  useEffect(() => {
    if (!running) return;
    let raf = 0, last = performance.now(), lastUi = 0, lastSample = -1;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * speedRef.current;
      last = now;
      const sub = Math.ceil(dt / 0.01);
      let s = stateRef.current;
      for (let i = 0; i < sub; i++) s = step(s, cfgRef.current, dt / sub);
      stateRef.current = s;
      if (now - lastUi > 80) {
        lastUi = now; setUi(s);
        if (s.t - lastSample >= 0.5) {
          lastSample = s.t;
          setHistory((h) => [...h, { t: +s.t.toFixed(1), h: +(s.h / 1000).toFixed(3), v: +s.v.toFixed(1) }].slice(-400));
        }
      }
      if (s.phase === "crash" || s.phase === "landed") { setUi(s); setRunning(false); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const reset = () => { setRunning(false); stateRef.current = initialState(config); setUi(stateRef.current); setHistory([]); };
  const ratio = twr(config);
  const body = BODIES[config.body];
  const fuelPct = (ui.fuel / config.fuelMass) * 100;
  const g = body.g;
  const ended = ui.phase === "crash" || ui.phase === "landed";

  let status = PHASE_LABEL[ui.phase];
  let statusTone = "text-primary";
  if (ui.reachedSpace && !ended) { status = "Sukces: Kosmos osiągnięty!"; statusTone = "text-success"; }
  if (ui.phase === "crash") statusTone = "text-destructive";
  if (ui.phase === "landed") { statusTone = "text-success"; if (ui.reachedSpace) status = "Lądowanie (po locie w kosmos)"; }

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const mm = Math.floor(ui.t / 60).toString().padStart(2, "0");
  const ss = Math.floor(ui.t % 60).toString().padStart(2, "0");

  return (
    <div className="min-h-screen grid-bg bg-background font-sans text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="font-display text-lg font-bold tracking-widest text-primary">MISSION CONTROL <span className="text-accent">// SYMULATOR STARTU</span></h1>
        <div className="font-mono text-sm text-muted-foreground">T+ <span className="text-foreground">{mm}:{ss}</span></div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-[300px_1fr_340px]">
        {/* Config */}
        <aside className="panel space-y-5 p-4">
          <h2 className="font-display text-sm tracking-widest text-primary">KONFIGURACJA RAKIETY</h2>
          <Param label="Masa sucha" unit="kg" value={config.dryMass} min={1000} max={50000} step={500} onChange={(v) => set("dryMass", v)} disabled={started} />
          <Param label="Masa paliwa" unit="kg" value={config.fuelMass} min={5000} max={200000} step={1000} onChange={(v) => set("fuelMass", v)} disabled={started} />
          <Param label="Siła ciągu" unit="kN" value={config.thrustKN} min={100} max={5000} step={50} onChange={(v) => set("thrustKN", v)} disabled={started} />
          <Param label="Spalanie paliwa" unit="kg/s" value={config.burnRate} min={50} max={1000} step={10} onChange={(v) => set("burnRate", v)} disabled={started} />
          <Param label="Wsp. oporu (Cd)" unit="" value={config.dragCoef} min={0.1} max={1} step={0.05} onChange={(v) => set("dragCoef", v)} disabled={started} fmt={(v) => v.toFixed(2)} />

          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Wybór obiektu</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BODIES) as BodyId[]).map((id) => (
                <Button key={id} size="sm" disabled={started} variant={config.body === id ? "default" : "outline"} onClick={() => set("body", id)}>
                  {BODIES[id].name}
                </Button>
              ))}
            </div>
            <div className="mt-2 font-mono text-xs text-muted-foreground">g = {body.g} m/s² · ρ₀ = {body.rho0} kg/m³</div>
          </div>

          <div className={cn("rounded-md border p-3", ratio < 1 ? "border-destructive bg-destructive/10" : "border-success/50 bg-success/10")}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Stosunek ciągu do wagi (TWR)</div>
            <div className={cn("font-mono text-2xl font-semibold", ratio < 1 ? "text-destructive" : "text-success")}>{ratio.toFixed(2)}</div>
            {ratio < 1 && <div className="text-sm text-destructive">Za mały ciąg — rakieta nie oderwie się od ziemi!</div>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button className="glow-primary" disabled={running || ended} onClick={() => setRunning(true)}>START</Button>
            <Button variant="secondary" disabled={!running} onClick={() => setRunning(false)}>PAUZA</Button>
            <Button variant="outline" onClick={reset}>RESET</Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Prędkość</span>
            {[1, 2, 5].map((x) => (
              <Button key={x} size="sm" variant={speed === x ? "default" : "outline"} onClick={() => setSpeed(x)}>{x}x</Button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <section className="panel relative h-[70vh] min-h-[480px] overflow-hidden lg:h-auto">
          <FlightCanvas stateRef={stateRef} config={config} />
          <div className="pointer-events-none absolute left-4 top-4 space-y-1">
            <div className="font-display text-xs tracking-widest text-muted-foreground">WIZUALIZACJA LOTU · {body.name.toUpperCase()}</div>
            <div className={cn("font-display text-xl font-bold", statusTone)}>{status}</div>
            <div className="font-mono text-sm text-success">Apogeum: {fmtAlt(ui.apogee)}</div>
          </div>
        </section>

        {/* Telemetry */}
        <aside className="space-y-3">
          <h2 className="font-display text-sm tracking-widest text-primary">TELEMETRIA NA ŻYWO</h2>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Wysokość" value={fmtAlt(ui.h)} />
            <Metric label="Prędkość" value={`${ui.v.toFixed(1)} m/s`} />
            <Metric label="Przyspieszenie" value={`${ui.a.toFixed(2)} m/s²`} sub={`${(ui.a / 9.81 + (g / 9.81)).toFixed(2)} G`} />
            <Metric label="Czas misji" value={`T+ ${mm}:${ss}`} />
          </div>
          <div className="panel p-3">
            <div className="flex justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Pozostałe paliwo</span><span className="font-mono text-accent">{fuelPct.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent glow-accent transition-all" style={{ width: `${fuelPct}%` }} />
            </div>
          </div>
          <ChartCard title="Wysokość w czasie (km)" data={history} dataKey="h" color="var(--chart-1)" />
          <ChartCard title="Prędkość w czasie (m/s)" data={history} dataKey="v" color="var(--chart-2)" />
        </aside>
      </main>
    </div>
  );
}

function fmtAlt(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
}

function Param({ label, unit, value, min, max, step, onChange, disabled, fmt }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean; fmt?: (v: number) => string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{fmt ? fmt(value) : value.toLocaleString("pl-PL")} {unit}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
      {sub && <div className="font-mono text-xs text-accent">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, data, dataKey, color }: { title: string; data: Sample[]; dataKey: "h" | "v"; color: string }) {
  return (
    <div className="panel p-3">
      <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
            <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
