import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Line, Stars } from '@react-three/drei';
import { CanvasTexture, Color, Group, LatheGeometry, Mesh, Quaternion, Vector2, Vector3, DoubleSide, SRGBColorSpace } from 'three';
import type { OrbitControls as OrbitType } from 'three-stdlib';
import { activeVehicle, predictTrajectory, telemetry, PLANETS, PLASMA_TEMP, type AerospaceConfig, type Flight, type CameraMode, type Vehicle } from '@/lib/aerospace';

export type ScenePalette = Record<'sky' | 'space' | 'ocean' | 'land' | 'concrete' | 'metal' | 'dark' | 'light' | 'flame' | 'hot' | 'trace' | 'atmosphere', string>;
interface SceneProps { flightRef: React.RefObject<Flight>; config: AerospaceConfig; cameraMode: CameraMode; markers: boolean; prediction: boolean; palette: ScenePalette }
function surfaceTexture(p: ScenePalette, kind: 'ground' | 'hull' | 'deck' | 'planet') {
  const canvas = document.createElement('canvas'); canvas.width = kind === 'planet' ? 1024 : 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); if (!ctx) return new CanvasTexture(canvas);
  ctx.fillStyle = kind === 'planet' ? p.ocean : kind === 'hull' ? p.light : p.concrete; ctx.fillRect(0, 0, canvas.width, 512);
  if (kind === 'hull') {
    ctx.strokeStyle = p.metal; ctx.lineWidth = 2;
    for (let y = 40; y < 512; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    ctx.fillStyle = p.dark; ctx.fillRect(0, 300, 512, 20); ctx.fillRect(0, 455, 512, 35);
    ctx.font = 'bold 44px monospace'; ctx.fillText('SPACE LAB', 40, 240);
    ctx.fillStyle = p.flame; ctx.fillRect(60, 100, 35, 12);
  } else if (kind === 'deck') {
    ctx.fillStyle = p.dark; ctx.fillRect(10, 10, 492, 492); ctx.strokeStyle = p.light; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(256, 256, 160, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(256, 80); ctx.lineTo(256, 432); ctx.moveTo(80, 256); ctx.lineTo(432, 256); ctx.stroke();
    ctx.font = 'bold 24px monospace'; ctx.fillStyle = p.light; ctx.fillText('OCISLY', 205, 470);
  } else {
    for (let i = 0; i < 1800; i++) {
      const x = (Math.sin(i * 127.1) * 43758.5 % 1 + 1) % 1 * canvas.width;
      const y = (Math.sin(i * 311.7) * 43758.5 % 1 + 1) % 1 * 512;
      ctx.fillStyle = kind === 'planet' ? p.land : i % 3 ? p.metal : p.dark;
      ctx.globalAlpha = kind === 'planet' ? 0.5 : 0.15;
      if (kind === 'planet') { ctx.beginPath(); ctx.ellipse(x, y, 12 + i % 30, 8 + i % 20, Math.sin(i), 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (kind === 'ground') { ctx.strokeStyle = p.dark; ctx.lineWidth = 2; for (let x = 0; x < 512; x += 64) { ctx.strokeRect(x, 0, 64, 512); ctx.strokeRect(0, x, 512, 64); } }
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}
function Cylinder({ position, size, color, metal = 0.4 }: { position: [number, number, number]; size: [number, number, number]; color: string; metal?: number }) {
  return <mesh position={position} castShadow receiveShadow><cylinderGeometry args={[size[0], size[1], size[2], 24]} /><meshStandardMaterial color={color} metalness={metal} roughness={0.5} /></mesh>;
}
function Rocket({ vehicle, flightRef, config, palette: p, markers }: { vehicle: 'booster' | 'upper' } & Pick<SceneProps, 'flightRef' | 'config' | 'palette' | 'markers'>) {
  const root = useRef<Group>(null), exhaust = useRef<Group>(null), nozzle = useRef<Group>(null), heat = useRef<Mesh>(null), mach = useRef<Mesh>(null), rcs = useRef<Group>(null);
  const fins = useRef<Group[]>([]), legs = useRef<Group[]>([]), com = useRef<Mesh>(null);
  const hull = useMemo(() => surfaceTexture(p, 'hull'), [p]);
  const profile = useMemo(() => new LatheGeometry([new Vector2(0, 0), new Vector2(1.8, 0), new Vector2(1.8, 37), new Vector2(1.7, 40), new Vector2(1.4, 43), new Vector2(0.8, 46), new Vector2(0, 48)], 32), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  useEffect(() => () => { hull.dispose(); profile.dispose(); }, [hull, profile]);
  useFrame(({ clock }, dt) => {
    const f = flightRef.current, v = vehicle === 'upper' ? f.upper : f.booster;
    if (!root.current || !v) { if (root.current) root.current.visible = false; return; }
    const active = activeVehicle(f), r = PLANETS[config.body].radius;
    root.current.visible = true;
    root.current.position.set(v.p.x - active.p.x, v.p.y - active.p.y + Math.min(100, Math.max(0, active.p.length() - r)), v.p.z - active.p.z);
    root.current.quaternion.copy(v.attitude);
    const destroyed = ['crash', 'rud'].includes(v.phase);
    root.current.scale.setScalar(destroyed ? 0.3 : 1);
    const burning = f.launched && v.fuel > 0 && v.throttle > 0 && !destroyed;
    if (exhaust.current) { exhaust.current.visible = burning; exhaust.current.scale.set(1 + Math.sin(clock.elapsedTime * 24) * 0.08, v.throttle * (1 + Math.sin(clock.elapsedTime * 17) * 0.12), 1); }
    if (nozzle.current) nozzle.current.rotation.set(v.gimbal.x, 0, v.gimbal.z);
    if (heat.current) heat.current.visible = v.temperature > PLASMA_TEMP || destroyed;
    const m = telemetry(f, config, v);
    if (com.current) com.current.position.y = m.com;
    if (mach.current) { mach.current.visible = m.mach > 0.92 && m.mach < 1.18 && m.density > 0.01; mach.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.1); }
    if (rcs.current) { rcs.current.visible = v.rcs > 0.03; rcs.current.scale.setScalar(0.7 + Math.sin(clock.elapsedTime * 30) * 0.3); }
    fins.current.forEach((fin) => { fin.rotation.z += ((v.fins ? Math.PI / 2 : 0) - fin.rotation.z) * (1 - Math.exp(-4 * dt)); fin.rotation.y = v.gimbal.x * 4; });
    legs.current.forEach((leg) => { leg.rotation.z += ((v.legs ? 0.65 : 0.02) - leg.rotation.z) * (1 - Math.exp(-3 * dt)); });
    void up;
  });
  const upper = vehicle === 'upper';
  return <group ref={root}>
    <group scale={upper ? [1, 0.5, 1] : [1, 1, 1]}>
      <mesh geometry={profile} castShadow><meshStandardMaterial map={hull} metalness={0.55} roughness={0.35} /></mesh>
      {[5, 17, 31, 38].map(y => <Cylinder key={y} position={[0, y, 0]} size={[1.84, 1.84, 0.16]} color={p.metal} />)}
      <group ref={nozzle} position={[0, 0.5, 0]}>
        {Array.from({ length: upper ? 1 : 9 }, (_, i) => { const a = i * Math.PI / 4, radius = i === 8 || upper ? 0 : 1.05; return <Cylinder key={i} position={[Math.sin(a) * radius, -0.7, Math.cos(a) * radius]} size={[0.25, 0.5, 1.2]} color={p.dark} metal={0.9} />; })}
      </group>
      {!upper && [0, 1, 2, 3].map((i) => <group key={i} rotation-y={i * Math.PI / 2}>
        <group position={[1.8, 34, 0]} ref={g => { if (g) fins.current[i] = g; }}>
          <mesh position={[0, -1.4, 0]}><boxGeometry args={[0.14, 2.8, 1.8]} /><meshStandardMaterial color={p.dark} /></mesh>
          {[0, 1, 2, 3, 4].map(j => <mesh key={j} position={[0.12, -0.3 - j * 0.5, 0]}><boxGeometry args={[0.16, 0.08, 1.9]} /><meshStandardMaterial color={p.metal} /></mesh>)}
        </group>
        <group position={[1.5, 8, 0]} ref={g => { if (g) legs.current[i] = g; }}>
          <mesh position={[0, -4, 0]}><boxGeometry args={[0.3, 8, 0.8]} /><meshStandardMaterial color={p.dark} /></mesh>
          <Cylinder position={[0.1, -2.7, 0.3]} size={[0.09, 0.09, 5]} color={p.metal} metal={0.95} />
          <mesh position={[0, -8, 0]}><boxGeometry args={[1.3, 0.25, 1.2]} /><meshStandardMaterial color={p.dark} /></mesh>
        </group>
      </group>)}
      <group ref={rcs} position={[0, 39, 0]}>{[0, 1, 2, 3].map(i => <mesh key={i} rotation-z={Math.PI / 2} rotation-y={i * Math.PI / 2} position={[Math.sin(i * Math.PI / 2) * 2.5, 0, Math.cos(i * Math.PI / 2) * 2.5]}><coneGeometry args={[0.5, 2, 12]} /><meshBasicMaterial color={p.light} transparent opacity={0.65} /></mesh>)}</group>
      {markers && <><mesh ref={com} position={[0, 22, 2]}><sphereGeometry args={[0.5, 12, 12]} /><meshBasicMaterial color={p.trace} /></mesh><mesh position={[0, 29, 2]}><sphereGeometry args={[0.5, 12, 12]} /><meshBasicMaterial color={p.hot} /></mesh></>}
    </group>
    <group ref={exhaust} position={[0, -1, 0]}>
      <mesh position={[0, -8, 0]} rotation-z={Math.PI}><coneGeometry args={[1.65, 16, 24]} /><meshBasicMaterial color={p.flame} transparent opacity={0.7} depthWrite={false} /></mesh>
      <mesh position={[0, -4, 0]} rotation-z={Math.PI}><coneGeometry args={[0.9, 8, 24]} /><meshBasicMaterial color={p.light} /></mesh>
      <pointLight color={p.flame} intensity={50} distance={45} />
    </group>
    <mesh ref={heat} position={[0, 3, 0]}><sphereGeometry args={[3, 24, 16]} /><meshBasicMaterial color={p.hot} transparent opacity={0.55} /></mesh>
    <mesh ref={mach} position={[0, 20, 0]} rotation-z={Math.PI}><coneGeometry args={[7, 10, 32, 1, true]} /><meshBasicMaterial color={p.light} transparent opacity={0.2} side={DoubleSide} depthWrite={false} /></mesh>
  </group>;
}
function World({ flightRef, config, palette: p }: Pick<SceneProps, 'flightRef' | 'config' | 'palette'>) {
  const world = useRef<Group>(null), globe = useRef<Group>(null);
  const ground = useMemo(() => surfaceTexture(p, 'ground'), [p]), deck = useMemo(() => surfaceTexture(p, 'deck'), [p]), planetTex = useMemo(() => surfaceTexture(p, 'planet'), [p]);
  useEffect(() => () => { ground.dispose(); deck.dispose(); planetTex.dispose(); }, [ground, deck, planetTex]);
  useFrame(() => {
    const v = activeVehicle(flightRef.current), radius = PLANETS[config.body].radius, h = v.p.length() - radius;
    const localH = Math.min(100, h);
    if (world.current) { world.current.position.set(-v.p.x, -(v.p.y - radius) + localH, -v.p.z); world.current.visible = h < 50000; }
    if (globe.current) { globe.current.visible = h > 3000; globe.current.position.set(-v.p.x, -v.p.y + localH, -v.p.z); }
  });
  return <>
    <group ref={globe}>
      <mesh><sphereGeometry args={[PLANETS[config.body].radius, 64, 32]} /><meshStandardMaterial map={planetTex} color={config.body === 'mars' ? p.flame : config.body === 'moon' ? p.metal : p.light} roughness={0.85} /></mesh>
      {config.body !== 'moon' && [1.002, 1.006].map((scale, i) => <mesh key={i} scale={scale}><sphereGeometry args={[PLANETS[config.body].radius, 48, 24]} /><meshBasicMaterial color={p.atmosphere} transparent opacity={0.035} side={DoubleSide} depthWrite={false} /></mesh>)}
    </group>
    <group ref={world}>
      <mesh rotation-x={-Math.PI / 2} position={[3000, -1, 0]}><planeGeometry args={[16000, 16000]} /><meshStandardMaterial color={config.body === 'earth' ? p.ocean : p.land} metalness={0.35} roughness={0.35} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-300, 0, 0]}><planeGeometry args={[900, 1400]} /><meshStandardMaterial color={p.land} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.15, 0]} receiveShadow><circleGeometry args={[45, 64]} /><meshStandardMaterial map={ground} /></mesh>
      <Cylinder position={[0, 1, 0]} size={[8, 8, 2]} color={p.dark} />
      <group position={[-12, 0, -5]}>
        {[0, 1, 2, 3].map(i => <mesh key={i} position={[(i % 2) * 6, 27, Math.floor(i / 2) * 6]} castShadow><boxGeometry args={[0.6, 54, 0.6]} /><meshStandardMaterial color={p.metal} /></mesh>)}
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[3, 3 + i * 7, 3]}><boxGeometry args={[7, 0.35, 7]} /><meshStandardMaterial color={p.dark} /></mesh>)}
        {[12, 27, 39].map(y => <mesh key={y} position={[8, y, 3]}><boxGeometry args={[10, 0.8, 1]} /><meshStandardMaterial color={p.metal} /></mesh>)}
      </group>
      <group position={[5000, 0.8, 0]}>
        <mesh><boxGeometry args={[85, 3, 45]} /><meshStandardMaterial color={p.dark} metalness={0.6} /></mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 1.6, 0]}><planeGeometry args={[83, 43]} /><meshStandardMaterial map={deck} /></mesh>
        {[-35, 35].map(x => <mesh key={x} position={[x, 4, -15]}><boxGeometry args={[10, 5, 8]} /><meshStandardMaterial color={p.light} /></mesh>)}
      </group>
    </group>
  </>;
}
function CameraRig({ flightRef, config, cameraMode }: Pick<SceneProps, 'flightRef' | 'config' | 'cameraMode'>) {
  const orbit = useRef<OrbitType>(null), prev = useRef(cameraMode);
  const target = useMemo(() => new Vector3(), []), ideal = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, dt) => {
    const v = activeVehicle(flightRef.current), h = v.p.length() - PLANETS[config.body].radius;
    const base = Math.min(100, h), center = new Vector3(0, base + (v.id === 'upper' ? 12 : 24), 0);
    if (cameraMode === 'orbit') {
      if (orbit.current) { orbit.current.target.lerp(center, 1 - Math.exp(-8 * dt)); orbit.current.update(); }
      if (prev.current !== cameraMode) camera.position.copy(center).add(new Vector3(75, 30, 110));
    } else {
      if (cameraMode === 'nose') { ideal.set(3.8, 39, 1).applyQuaternion(v.attitude).add(new Vector3(0, base, 0)); target.set(3, 0, 0).applyQuaternion(v.attitude).add(new Vector3(0, base, 0)); }
      else if (cameraMode === 'ground') { ideal.set(-v.p.x + 150, -(v.p.y - PLANETS[config.body].radius) + base + 4, -v.p.z + 180); target.copy(center); }
      else { ideal.set(55, 20, 85).applyQuaternion(v.attitude).add(center); target.copy(center); }
      camera.position.lerp(ideal, prev.current !== cameraMode ? 1 : 1 - Math.exp(-4 * dt)); camera.lookAt(target);
    }
    prev.current = cameraMode;
  });
  return cameraMode === 'orbit' ? <OrbitControls ref={orbit} minDistance={12} maxDistance={1200} enableDamping /> : null;
}
function Prediction({ flightRef, config, palette: p }: Pick<SceneProps, 'flightRef' | 'config' | 'palette'>) {
  const lineRef = useRef<React.ComponentRef<typeof Line>>(null), impact = useRef<Mesh>(null), last = useRef(-10);
  useFrame(({ clock }) => {
    if (!lineRef.current || clock.elapsedTime - last.current < 0.5) return;
    last.current = clock.elapsedTime;
    const f = flightRef.current, v = activeVehicle(f), radius = PLANETS[config.body].radius, localH = Math.min(100, v.p.length() - radius);
    const pts = predictTrajectory(f, config).map(pt => pt.sub(v.p).add(new Vector3(0, localH, 0)));
    lineRef.current.geometry.setPositions(pts.flatMap(pt => [pt.x, pt.y, pt.z]));
    const final = pts.at(-1); if (impact.current && final) impact.current.position.copy(final);
  });
  return <><Line ref={lineRef} points={[[0, 0, 0], [0, 1, 0]]} color={p.trace} lineWidth={1.2} dashed dashSize={8} gapSize={5} /><mesh ref={impact} rotation-x={-Math.PI / 2}><ringGeometry args={[5, 7, 32]} /><meshBasicMaterial color={p.trace} side={DoubleSide} /></mesh></>;
}
function SkyState({ flightRef, config, palette: p }: Pick<SceneProps, 'flightRef' | 'config' | 'palette'>) {
  const sky = useMemo(() => new Color(p.sky), [p]), space = useMemo(() => new Color(p.space), [p]);
  useFrame(({ scene }) => { const h = activeVehicle(flightRef.current).p.length() - PLANETS[config.body].radius; scene.background = sky.clone().lerp(space, Math.min(1, h / 85000)); });
  return null;
}
export function SpaceScene(props: SceneProps) {
  const p = props.palette, angle = (props.config.day - 6) * Math.PI / 12;
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [75, 50, 110], fov: 42, near: 0.2, far: 30_000_000 }} gl={{ antialias: true }}>
    <SkyState {...props} />
    <ambientLight intensity={0.5} />
    <hemisphereLight args={[p.light, p.ocean, 1]} />
    <directionalLight position={[Math.cos(angle) * 200, Math.max(10, Math.sin(angle) * 200), 100]} intensity={Math.sin(angle) > 0 ? 2.5 : 0.6} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} />
    <Environment resolution={64}><Lightformer intensity={1.5} position={[0, 100, 0]} scale={[200, 200, 1]} rotation-x={-Math.PI / 2} /><Lightformer color={p.atmosphere} intensity={1} position={[-100, 30, 20]} scale={[100, 100, 1]} rotation-y={Math.PI / 2} /></Environment>
    <Stars radius={1000000} depth={500000} count={700} factor={1000} fade speed={0} />
    <World {...props} />
    <Suspense fallback={null}><Rocket vehicle="booster" {...props} /><Rocket vehicle="upper" {...props} /></Suspense>
    {props.prediction && <Prediction {...props} />}
    <CameraRig {...props} />
  </Canvas>;
}