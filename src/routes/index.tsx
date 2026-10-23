import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Expand, Flame, Focus, Gauge, Layers, Orbit, Pause, Play, Radio, RotateCcw, Rocket, Settings2, Shield, Target, Volume2, VolumeX, Wind } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SpaceScene, type ScenePalette } from '@/components/sim/SpaceScene';
import { Navball } from '@/components/sim/Navball';
import { useSpaceFlight, type FlightSample } from '@/hooks/use-space-flight';
import { PLANETS, PROPELLANTS, type AerospaceConfig, type CameraMode, type Mode } from '@/lib/aerospace';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({ meta: [
    { title: 'SPACE LAB — Symulator 3D i inżynieria orbitalna' },
    { name: 'description', content: 'Polskie laboratorium lotu rakiety 3D: fizyka 6-DOF, dwa stopnie, autopilot PID, orbity i telemetria.' },
    { property: 'og:title', content: 'SPACE LAB // Symulator lotu 3D' },
    { property: 'og:description', content: 'Inżynieria lotu, sterowanie stopniami, lądowanie i mechanika orbitalna w interaktywnym laboratorium.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: SpaceLab,
});
const PHASES = { pad: 'Gotowość do startu', ascent: 'Wznoszenie', coast: 'Lot swobodny', descent: 'Powrót / opadanie', landed: 'Miękkie lądowanie', crash: 'Utrata pojazdu', rud: 'RUD · awaria strukturalna', orbit: 'STABILNA ORBITA OSIĄGNIĘTA!' };
const MODES: { id: Mode; label: string; short: string }[] = [
  { id: 'manual', label: 'Sterowanie ręczne', short: 'MANUAL' }, { id: 'sas', label: 'Stabilizacja obrotu', short: 'KILL ROT / SAS' },
  { id: 'prograde', label: 'Zgodnie z prędkością', short: 'PROGRADE' }, { id: 'retrograde', label: 'Przeciwnie do prędkości', short: 'RETROGRADE' },
  { id: 'gravity', label: 'Wejście na orbitę', short: 'GRAVITY TURN' }, { id: 'landing', label: 'Automatyczne lądowanie', short: 'SUICIDE BURN' },
];
const CAMERAS: { id: CameraMode; label: string }[] = [{ id: 'orbit', label: 'Swobodna orbita' }, { id: 'chase', label: 'Pościgowa' }, { id: 'nose', label: 'Z dziobu w dół' }, { id: 'ground', label: 'Teleskop naziemny' }];
const alt = (n: number) => !Number.isFinite(n) ? '∞' : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${n.toFixed(0)} m`;
const time = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;
function SpaceLab() {
  const sim = useSpaceFlight();
  const { config, flight, vehicle: v, metrics: m } = sim;
  const [tab, setTab] = useState('mission'), [settingsTab, setSettingsTab] = useState('rocket');
  const [markers, setMarkers] = useState(false), [prediction, setPrediction] = useState(true), [pip, setPip] = useState(true);
  const [palette, setPalette] = useState<ScenePalette | null>(null), [fullscreenError, setFullscreenError] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement), result: Record<string, string> = {};
    for (const key of ['sky', 'space', 'ocean', 'land', 'concrete', 'metal', 'dark', 'light', 'flame', 'hot', 'trace', 'atmosphere']) result[key] = css.getPropertyValue(`--scene-${key}`).trim();
    setPalette(result as ScenePalette);
  }, []);
  const locked = flight.launched, terminal = ['rud', 'landed', 'crash'].includes(v.phase);
  const fuelMax = v.id === 'upper' ? 90000 : config.fuelMass, fuelPct = v.fuel / fuelMax * 100;
  const twr = m.thrust / m.mass / PLANETS[config.body].g;
  const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await viewport.current?.requestFullscreen(); setFullscreenError(''); } catch { setFullscreenError('Pełny ekran jest niedostępny w tym oknie.'); } };
  return <div className="space-lab">
    <header className="lab-header">
      <div className="brand"><div className="brand-symbol"><Orbit size={25} /></div><div><h1>SPACE LAB<span className="text-primary"> //</span></h1><div className="brand-sub">ZAŁOŻENIA INŻYNIERYJNE I SYMULATOR 3D</div></div></div>
      <div className="header-center"><span className="live-dot" /> SYSTEMY ONLINE <span className="header-divider">/</span> <span className="text-muted-foreground">FIZYKA 6-DOF</span></div>
      <div className="mission-clock"><span className="text-muted-foreground">CZAS MISJI</span><strong>T+ {time(flight.t)}</strong></div>
    </header>
    <nav className="lab-navigation">
      <div className="flex gap-1">{[{ id: 'mission', label: 'Centrum misji', icon: Rocket }, { id: 'engineering', label: 'Inżynieria', icon: Settings2 }, { id: 'flightdata', label: 'Dane lotu', icon: Activity }].map(item => <Button key={item.id} variant="ghost" onClick={() => setTab(item.id)} className={cn('nav-item', tab === item.id && 'nav-active')}><item.icon size={15} />{item.label}</Button>)}</div>
      <div className="nav-mission-id"><span className="text-muted-foreground">MISJA</span> SL-001 <span className="text-primary">/</span> {PLANETS[config.body].name.toUpperCase()}</div>
    </nav>
    <main className={cn('lab-layout', tab !== 'mission' && 'lab-layout-secondary')}>
      <aside className="configuration">
        <SectionHeading icon={Settings2} title="KONFIGURACJA POJAZDU" tag="01" />
        <div className="config-tabs">{[{ id: 'rocket', label: 'Rakieta' }, { id: 'environment', label: 'Środowisko' }].map(t => <Button key={t.id} variant="ghost" onClick={() => setSettingsTab(t.id)} className={cn('config-tab', settingsTab === t.id && 'config-tab-active')}>{t.label}</Button>)}</div>
        {settingsTab === 'rocket' ? <>
          <div className="rocket-ident"><div className="text-primary"><Rocket size={22} /></div><div><strong>SL-9 / REUSABLE</strong><span>DWUSTOPNIOWA · KLASA ORBITALNA</span></div><span className="text-muted-foreground">I+II</span></div>
          <Field label="Propelent"><select aria-label="Propelent" value={config.propellant} disabled={locked} onChange={e => sim.configure('propellant', e.target.value as AerospaceConfig['propellant'])}>{Object.entries(PROPELLANTS).map(([id, p]) => <option key={id} value={id}>{p.name} — {p.description}</option>)}</select></Field>
          <div className="isp-pair"><span>Isp SL <b>{PROPELLANTS[config.propellant].sl} s</b></span><span>Isp VAC <b>{PROPELLANTS[config.propellant].vac} s</b></span></div>
          <Parameter label="Masa sucha · stopień I" value={config.dryMass} unit="kg" min={10000} max={50000} step={500} disabled={locked} onChange={n => sim.configure('dryMass', n)} />
          <Parameter label="Masa paliwa · stopień I" value={config.fuelMass} unit="kg" min={50000} max={500000} step={5000} disabled={locked} onChange={n => sim.configure('fuelMass', n)} />
          <Parameter label="Ciąg na poziomie morza" value={config.thrustKN} unit="kN" min={1000} max={12000} step={100} disabled={locked} onChange={n => sim.configure('thrustKN', n)} />
          <Parameter label="Współczynnik oporu" value={config.dragCoef} unit="Cd" min={0.1} max={1} step={0.05} disabled={locked} onChange={n => sim.configure('dragCoef', n)} />
          <div className="engineering-readout"><div><span>TWR</span><strong className={twr >= 1 ? 'text-success' : 'text-accent'}>{twr.toFixed(2)}</strong></div><div><span>MASA STARTOWA</span><strong>{(m.mass / 1000).toFixed(1)} <small>t</small></strong></div></div>
        </> : <>
          <Field label="Ciało niebieskie"><select aria-label="Ciało niebieskie" value={config.body} disabled={locked} onChange={e => sim.configure('body', e.target.value as AerospaceConfig['body'])}>{Object.entries(PLANETS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}</select></Field>
          <Parameter label="Wiatr boczny" value={config.wind} min={0} max={50} step={1} unit="m/s" disabled={locked} onChange={n => sim.configure('wind', n)} />
          <Parameter label="Porywy / turbulencje" value={config.gusts} min={0} max={20} step={1} unit="m/s" disabled={locked} onChange={n => sim.configure('gusts', n)} />
          <Parameter label="Limit strukturalny Max-Q" value={config.structuralLimit} min={20} max={150} step={5} unit="kPa" disabled={locked} onChange={n => sim.configure('structuralLimit', n)} />
          <Parameter label="Pora dnia" value={config.day} min={0} max={24} step={1} unit="h" onChange={n => sim.configure('day', n)} />
          <div className="environment-facts"><span>Grawitacja <b>{PLANETS[config.body].g} m/s²</b></span><span>Atmosfera ρ₀ <b>{PLANETS[config.body].rho} kg/m³</b></span><span>Ciśnienie <b>{m.pressure.toFixed(1)} kPa</b></span></div>
        </>}
        <SectionHeading icon={Crosshair} title="KOMPUTER POKŁADOWY" tag="PID" />
        <Field label="Tryb autopilota"><select aria-label="Tryb autopilota" value={v.mode} onChange={e => sim.setMode(e.target.value as Mode)}>{MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.short} — {mode.label}</option>)}</select></Field>
        <div className="autopilot-state"><span className="live-dot" />{v.mode === 'manual' ? 'STEROWANIE RĘCZNE' : 'KONTROLA ORIENTACJI AKTYWNA'}</div>
        <Field label="Cel lądowania"><select aria-label="Cel lądowania" value={config.target} onChange={e => sim.configure('target', e.target.value as 'pad' | 'ship')}><option value="ship">OCISLY · barka / 5 km</option><option value="pad">Lądowisko · platforma startowa</option></select></Field>
        <div className="hardware-switches"><Toggle label="Podwozie" checked={v.legs} onChange={() => sim.toggle('legs')} /><Toggle label="Lotki kratowe" checked={v.fins} onChange={() => sim.toggle('fins')} /><Toggle label="Hamulce aerodynamiczne" checked={v.brakes} onChange={() => sim.toggle('brakes')} /></div>
        <div className="config-foot"><Shield size={12} /> MODEL INŻYNIERYJNY / PRZYBLIŻENIE ORBITALNE</div>
      </aside>
      <div className="mission-center">
        {tab === 'engineering' ? <Engineering sim={sim} /> : tab === 'flightdata' ? <FlightData sim={sim} /> : <>
          <div className="viewport-toolbar"><div className="flex items-center gap-2"><span className="live-dot" /><span>WIZUALIZACJA LOTU</span><span className="viewport-tag">3D LIVE</span></div><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Telemetria obraz w obrazie" title="Telemetria obraz w obrazie" onClick={() => setPip(!pip)} className={pip ? 'text-primary' : ''}><Gauge /></Button><Button size="icon" variant="ghost" aria-label="Pełny ekran" title="Pełny ekran" onClick={fullscreen}><Expand /></Button></div></div>
          <div ref={viewport} className="flight-viewport">
            {palette && <SpaceScene flightRef={sim.flightRef} config={config} cameraMode={sim.cameraMode} markers={markers} prediction={prediction} palette={palette} />}
            <div className="viewport-info"><div className="text-xs text-muted-foreground">SL-9 <span className="text-primary">//</span> STOPIEŃ {v.id === 'upper' ? 'II' : 'I'}</div><div className={cn('flight-status', terminal ? 'text-destructive' : 'text-foreground')}>{PHASES[v.phase]}</div><div className="viewport-location"><Target size={12} />{config.body === 'earth' ? 'CAPE CANAVERAL' : PLANETS[config.body].name.toUpperCase()} · LC-39A</div></div>
            <div className="viewport-coordinate"><span>ALT</span> {alt(m.altitude)}<br /><span>VEL</span> {m.speed.toFixed(1)} m/s</div>
            {pip && <div className="pip-telemetry"><div className="pip-heading"><Radio size={12} /> TÉLÉMÉTRIE / SL-001</div><div><span>VY</span><b>{m.vertical.toFixed(1)} m/s</b></div><div><span>VX</span><b>{m.horizontal.toFixed(1)} m/s</b></div><div><span>APOGEUM</span><b>{alt(v.apogee)}</b></div><div><span>IMPACT X</span><b>{alt(m.impact)}</b></div></div>}
            <div className="camera-selector"><Focus size={14} /><select aria-label="Kamera" value={sim.cameraMode} onChange={e => sim.setCameraMode(e.target.value as CameraMode)}>{CAMERAS.map(cam => <option key={cam.id} value={cam.id}>{cam.label}</option>)}</select></div>
            <div className="view-toggles"><Button variant="ghost" size="sm" className={prediction ? 'text-success' : ''} onClick={() => setPrediction(!prediction)}><Orbit size={13} />Trajektoria</Button><Button variant="ghost" size="sm" className={markers ? 'text-primary' : ''} onClick={() => setMarkers(!markers)}><Crosshair size={13} />CoM / CoP</Button></div>
            {fullscreenError && <div className="fullscreen-error">{fullscreenError}</div>}
          </div>
          <div className="stage-strip"><span className="stage-label"><Layers size={14} /> AKTYWNY POJAZD</span><div className="flex gap-1"><Button size="sm" variant={flight.active === 'booster' ? 'secondary' : 'ghost'} onClick={() => sim.selectStage('booster')}>I · BOOSTER</Button><Button size="sm" disabled={!flight.separated} variant={flight.active === 'upper' ? 'secondary' : 'ghost'} onClick={() => sim.selectStage('upper')}>II · ORBITER</Button></div><Button variant="ghost" size="sm" disabled={!flight.launched || flight.separated || terminal} onClick={sim.stage} className="text-accent">SEPARACJA <ChevronRight size={13} /></Button></div>
          <div className="flight-controls"><div className="launch-controls"><Button disabled={terminal} onClick={sim.startPause} className={cn('launch-button', flight.running && 'launch-running')}>{flight.running ? <Pause size={14} /> : <Play size={14} />}{flight.running ? 'PAUZA' : flight.launched ? 'WZNÓW LOT' : 'START MISJI'}</Button><Button size="icon" variant="outline" aria-label="Reset misji" title="Reset misji" onClick={sim.reset}><RotateCcw /></Button></div><div className="throttle-control"><div><Flame size={13} /><span>PRZEPUSTNICA</span><b>{(v.throttle * 100).toFixed(0)}%</b></div><Slider aria-label="Przepustnica" min={0} max={100} step={1} value={[v.throttle * 100]} onValueChange={n => sim.setThrottle((n[0] ?? 0) / 100)} /></div><div className="speed-controls">{[1, 2, 5, 10].map(n => <Button key={n} size="sm" variant={sim.speed === n ? 'secondary' : 'ghost'} onClick={() => sim.setSpeed(n)}>{n}×</Button>)}</div><Button size="icon" variant="ghost" aria-label={sim.muted ? 'Włącz dźwięk' : 'Wycisz dźwięk'} title={sim.muted ? 'Włącz dźwięk' : 'Wycisz dźwięk'} onClick={sim.toggleSound}>{sim.muted ? <VolumeX /> : <Volume2 />}</Button></div>
          <div className="touch-flight-controls">{[{ label: 'Pochyl do przodu', icon: ArrowUp, pitch: 1, yaw: 0 }, { label: 'Obróć w lewo', icon: ChevronLeft, pitch: 0, yaw: -1 }, { label: 'Obróć w prawo', icon: ChevronRight, pitch: 0, yaw: 1 }, { label: 'Pochyl do tyłu', icon: ArrowDown, pitch: -1, yaw: 0 }].map(i => <Button key={i.label} variant="outline" size="icon" aria-label={i.label} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); sim.touch.current = { pitch: i.pitch, yaw: i.yaw, roll: 0 }; }} onPointerUp={() => { sim.touch.current = { pitch: 0, yaw: 0, roll: 0 }; }} onPointerCancel={() => { sim.touch.current = { pitch: 0, yaw: 0, roll: 0 }; }}><i.icon /></Button>)}</div>
          <div className="charts-header"><SectionHeading icon={Activity} title="PRZEBIEG LOTU" tag="LIVE" /><span>ZSYNCHRONIZOWANA TELEMETRIA</span></div>
          <div className="flight-charts">{[{ title: 'WYSOKOŚĆ', unit: 'km', key: 'h' as const, value: (m.altitude / 1000).toFixed(2), color: 'var(--chart-1)' }, { title: 'PRĘDKOŚĆ', unit: 'm/s', key: 'v' as const, value: m.speed.toFixed(1), color: 'var(--chart-2)' }, { title: 'CIŚNIENIE DYNAMICZNE', unit: 'kPa', key: 'q' as const, value: m.q.toFixed(2), color: 'var(--chart-3)' }, { title: 'TEMPERATURA POSZYCIA', unit: '°C', key: 'temp' as const, value: v.temperature.toFixed(0), color: 'var(--chart-4)' }].map(item => <FlightChart key={item.key} {...item} dataKey={item.key} data={sim.history} />)}</div>
          <div className="events-heading"><Radio size={13} /> DZIENNIK MISJI <span>{flight.events.length} ZDARZEŃ</span></div><div className="mission-events">{flight.events.slice(0, 4).map((e, i) => <div key={`${e.t}-${i}`}><time>T+ {time(e.t)}</time><span className={e.tone === 'warn' ? 'text-accent' : e.tone === 'success' ? 'text-success' : ''}>{e.text}</span></div>)}</div>
        </>}
      </div>
      <aside className="telemetry-sidebar">
        <SectionHeading icon={Radio} title="TELEMETRIA" tag="LIVE" />
        <div className="attitude-instrument"><Navball flightRef={sim.flightRef} /><div className="navball-caption"><span>ORIENTACJA / NAVBALL</span><b>{m.pitch.toFixed(1)}° <span className="text-muted-foreground">PITCH</span></b></div></div>
        <div className="primary-metrics"><TelemetryMetric label="WYSOKOŚĆ" value={alt(m.altitude)} icon={ArrowUp} /><TelemetryMetric label="PRĘDKOŚĆ" value={`${m.speed.toFixed(1)}`} unit="m/s" icon={Gauge} /></div>
        <div className="velocity-split"><span>VY <b>{m.vertical.toFixed(1)}</b> m/s</span><span>VX <b>{m.horizontal.toFixed(1)}</b> m/s</span></div>
        <div className="instrument-row"><span>MACH</span><strong>{m.mach.toFixed(2)}</strong><span>PRZECIĄŻENIE</span><strong>{m.gforce.toFixed(2)} <small>G</small></strong></div>
        <GaugeBar label="CIŚNIENIE DYNAMICZNE" value={`${m.q.toFixed(2)} kPa`} fraction={m.q / config.structuralLimit} tone={m.q > config.structuralLimit * 0.8 ? 'danger' : 'primary'} /><div className="maxq-note">MAX-Q <b>{v.maxQ.toFixed(2)} kPa</b><span>LIMIT {config.structuralLimit}</span></div>
        <GaugeBar label="TEMPERATURA POSZYCIA" value={`${v.temperature.toFixed(0)} °C`} fraction={v.temperature / 1200} tone={v.temperature > 800 ? 'danger' : 'accent'} />
        <GaugeBar label="POZOSTAŁE PALIWO" value={`${fuelPct.toFixed(1)} %`} fraction={fuelPct / 100} tone="success" /><div className="maxq-note"><b>{(v.fuel / 1000).toFixed(1)} t</b><span>{(m.thrust / 1000).toFixed(0)} kN · Isp {m.isp.toFixed(0)} s</span></div>
        <div className="delta-v"><span>ΔV POZOSTAŁE</span><strong>{m.deltaV.toFixed(0)} <small>m/s</small></strong></div>
        <SectionHeading icon={Orbit} title="PARAMETRY ORBITY" tag="KEPLER" />
        <div className="orbit-values"><div><span>APOAPSIS</span><b>{alt(m.apoapsis)}</b></div><div><span>PERIAPSIS</span><b>{alt(m.periapsis)}</b></div><div><span>ULGA ODŚRODKOWA</span><b>{m.centrifugal.toFixed(3)} m/s²</b></div><div><span>WYSOKOŚĆ HAMOWANIA</span><b>{alt(m.brakingAltitude)}</b></div></div>
        <div className="orbital-status"><span className={cn('live-dot', m.periapsis <= 100000 && 'dot-muted')} />{m.periapsis > 100000 ? 'ORBITA STABILNA' : 'TOR SUBORBITALNY'}</div>
      </aside>
    </main>
    <footer className="lab-footer"><span><span className="live-dot" /> SPACE LAB FLIGHT SYSTEMS <span className="text-muted-foreground">/ v3.0</span></span><span>SI · 6-DOF · PID <span className="text-primary">//</span> {PLANETS[config.body].name.toUpperCase()}</span></footer>
  </div>;
}
function SectionHeading({ icon: Icon, title, tag }: { icon: typeof Rocket; title: string; tag: string }) { return <div className="section-heading"><Icon size={14} /><h2>{title}</h2><span>{tag}</span></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="config-field"><label>{label}</label>{children}</div>; }
function Parameter({ label, value, min, max, step, unit, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; disabled?: boolean; onChange: (n: number) => void }) { return <div className="parameter"><div><label>{label}</label><span>{value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} <small>{unit}</small></span></div><Slider aria-label={label} value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={n => onChange(n[0] ?? value)} /></div>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) { return <label className="hardware-toggle"><span>{label}</span><Switch aria-label={label} checked={checked} onCheckedChange={onChange} /></label>; }
function TelemetryMetric({ label, value, unit, icon: Icon }: { label: string; value: string; unit?: string; icon: typeof Rocket }) { return <div><span><Icon size={13} />{label}</span><strong>{value} <small>{unit}</small></strong></div>; }
function GaugeBar({ label, value, fraction, tone }: { label: string; value: string; fraction: number; tone: string }) { return <div className="gauge-bar"><div><span>{label}</span><b>{value}</b></div><div className="gauge-track"><div className={`gauge-fill gauge-${tone}`} style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }} /></div></div>; }
function FlightChart({ title, unit, value, color, data, dataKey }: { title: string; unit: string; value: string; color: string; data: FlightSample[]; dataKey: keyof Omit<FlightSample, 't'> }) { return <div className="flight-chart"><div className="chart-title">{title}<span>{unit}</span></div><div className="chart-value">{value}<small>{unit}</small></div><div className="chart-plot"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.length ? data : [{ t: 0, h: 0, v: 0, q: 0, temp: 15 }]} margin={{ top: 8, left: -32, right: 5, bottom: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} /><XAxis dataKey="t" tick={{ fill: 'var(--muted-foreground)', fontSize: 8 }} tickLine={false} axisLine={false} minTickGap={30} /><YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 8 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 11 }} /><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></div>; }
function Engineering({ sim }: { sim: ReturnType<typeof useSpaceFlight> }) { const m = sim.metrics; return <div className="engineering-page"><SectionHeading icon={Settings2} title="ZAŁOŻENIA INŻYNIERYJNE" tag="6-DOF" /><h2>Model lotu i układy sterowania</h2><div className="engineering-table">{[
  ['Propelent', PROPELLANTS[sim.config.propellant].name], ['Gęstość propelentu', `${PROPELLANTS[sim.config.propellant].density} kg/m³`], ['Isp aktualne', `${m.isp.toFixed(2)} s`], ['Ciśnienie atmosferyczne', `${m.pressure.toFixed(3)} kPa`], ['Gęstość atmosfery', `${m.density.toExponential(3)} kg/m³`], ['Środek masy / CoM', `${m.com.toFixed(2)} m`], ['Środek parcia / CoP', `${m.cop.toFixed(2)} m`], ['Moment bezwładności · model', 'Dynamika obrotowa / quaternion'], ['RCS · pozostały gaz', `${sim.vehicle.rcsFuel.toFixed(1)} kg`], ['Stopień II · paliwo / masa sucha', '90 000 kg / 4 000 kg'], ['Pole przekroju', '10 m²'], ['Granica stabilnej orbity', 'Periapsis > 100 km'], ['Lądowanie', '|Vy| < 3 m/s · podwozie · cel · przechył < 12°'], ['Cel / barka', 'Of Course I Still Love You · 5 km'],
].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div><h3>Równania modelu</h3><div className="equation-list"><code>q = ½ ρ |v − wiatr|²</code><code>Δv = Isp · g₀ · ln(m₀ / mf)</code><code>g(h) = g₀ · (R / (R + h))²</code><code>Q̇ = 0.025 · ½ ρv³ − εσ(T⁴ − Tₐ⁴)</code><code>PID: Kp 1.6 · Ki 0.08 · Kd 1.9</code></div><div className="engineering-note">Model edukacyjny: warstwowa atmosfera, przybliżone grzanie poszycia i aerodynamika. Bez obrotu planety, wielociałowej grawitacji i certyfikacji inżynieryjnej.</div></div>; }
function FlightData({ sim }: { sim: ReturnType<typeof useSpaceFlight> }) { return <div className="engineering-page"><SectionHeading icon={Activity} title="DANE LOTU" tag={`${sim.history.length}`} /><h2>Zapis telemetrii</h2><div className="flight-data-table"><table><thead><tr><th>T+ [s]</th><th>H [km]</th><th>V [m/s]</th><th>q [kPa]</th><th>T [°C]</th></tr></thead><tbody>{sim.history.length ? sim.history.slice().reverse().map((row, i) => <tr key={i}><td>{row.t.toFixed(1)}</td><td>{row.h.toFixed(3)}</td><td>{row.v.toFixed(1)}</td><td>{row.q.toFixed(2)}</td><td>{row.temp.toFixed(1)}</td></tr>) : <tr><td colSpan={5} className="empty-data">Brak pomiarów · misja nie rozpoczęła się</td></tr>}</tbody></table></div></div>; }
