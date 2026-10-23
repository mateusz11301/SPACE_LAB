import { Quaternion, Vector3 } from 'three';

export const G0 = 9.80665;
export const ORBIT_HEIGHT = 100_000;
export const SHIP_DOWNRANGE = 5_000;
export const PLASMA_TEMP = 800;
export const PROPELLANTS = {
  kerolox: { name: 'RP-1 / LOX', description: 'Kerozyna', sl: 282, vac: 311, density: 1030 },
  methalox: { name: 'LCH₄ / LOX', description: 'Metan', sl: 330, vac: 360, density: 820 },
  hydrolox: { name: 'LH₂ / LOX', description: 'Wodór', sl: 366, vac: 452, density: 360 },
} as const;
export const PLANETS = {
  earth: { name: 'Ziemia', radius: 6_371_000, g: 9.81, rho: 1.225, scale: 8500, temp: 288.15 },
  mars: { name: 'Mars', radius: 3_389_500, g: 3.71, rho: 0.02, scale: 11100, temp: 210 },
  moon: { name: 'Księżyc', radius: 1_737_400, g: 1.62, rho: 0, scale: 1, temp: 200 },
} as const;
export type Mode = 'manual' | 'sas' | 'prograde' | 'retrograde' | 'gravity' | 'landing';
export type CameraMode = 'orbit' | 'chase' | 'nose' | 'ground';
export type FlightPhase = 'pad' | 'ascent' | 'coast' | 'descent' | 'landed' | 'crash' | 'rud' | 'orbit';
export interface AerospaceConfig {
  dryMass: number; fuelMass: number; thrustKN: number; dragCoef: number;
  propellant: keyof typeof PROPELLANTS; body: keyof typeof PLANETS;
  wind: number; gusts: number; structuralLimit: number; target: 'pad' | 'ship'; day: number;
}
export const DEFAULT_CONFIG: AerospaceConfig = {
  dryMass: 25_600, fuelMass: 410_000, thrustKN: 7600, dragCoef: 0.3,
  propellant: 'kerolox', body: 'earth', wind: 0, gusts: 0, structuralLimit: 45, target: 'ship', day: 14,
};
export interface Vehicle {
  id: 'booster' | 'upper'; p: Vector3; v: Vector3; attitude: Quaternion; omega: Vector3;
  fuel: number; dryMass: number; throttle: number; mode: Mode;
  phase: FlightPhase; legs: boolean; fins: boolean; brakes: boolean;
  temperature: number; maxQ: number; apogee: number; integral: Vector3;
  gimbal: Vector3; rcs: number; rcsFuel: number; landingSpeed: number | null;
}
export interface Flight {
  t: number; running: boolean; launched: boolean; separated: boolean; active: 'booster' | 'upper';
  booster: Vehicle; upper: Vehicle | null; events: { t: number; text: string; tone: 'normal' | 'warn' | 'success' }[];
}
export interface Telemetry {
  altitude: number; speed: number; vertical: number; horizontal: number; mach: number;
  q: number; density: number; pressure: number; isp: number; thrust: number; mass: number;
  gforce: number; deltaV: number; apoapsis: number; periapsis: number; centrifugal: number;
  pitch: number; com: number; cop: number; impact: number; brakingAltitude: number;
}
export interface PilotInput { pitch: number; yaw: number; roll: number; throttle: number }
export const ZERO_INPUT: PilotInput = { pitch: 0, yaw: 0, roll: 0, throttle: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function atmosphere(c: AerospaceConfig, altitude: number) {
  const b = PLANETS[c.body];
  const h = Math.max(0, altitude);
  const temp = c.body === 'earth' ? h < 11000 ? 288.15 - 0.0065 * h : h < 20000 ? 216.65 : h < 47000 ? 216.65 + Math.min(h - 20000, 27000) * 0.002 : 270.65 : b.temp;
  const rho = h > 180000 ? 0 : b.rho * Math.exp(-h / b.scale);
  const pressure = rho * 287.05 * temp / 1000;
  const sound = Math.sqrt(1.4 * 287.05 * temp);
  return { temp, rho, pressure, sound };
}
export function specificImpulse(c: AerospaceConfig, pressure: number) {
  const p = PROPELLANTS[c.propellant];
  return p.vac + (p.sl - p.vac) * clamp(pressure / 101.3, 0, 1);
}
export function makeFlight(c: AerospaceConfig): Flight {
  const booster: Vehicle = {
    id: 'booster', p: new Vector3(0, PLANETS[c.body].radius + 2, 0), v: new Vector3(), attitude: new Quaternion(), omega: new Vector3(),
    fuel: c.fuelMass, dryMass: c.dryMass, throttle: 1, mode: 'sas', phase: 'pad', legs: false, fins: false, brakes: false,
    temperature: 15, maxQ: 0, apogee: 0, integral: new Vector3(), gimbal: new Vector3(), rcs: 0, rcsFuel: 250, landingSpeed: null,
  };
  return { t: 0, running: false, launched: false, separated: false, active: 'booster', booster, upper: null, events: [{ t: 0, text: 'Systemy pokładowe gotowe', tone: 'success' }] };
}
export function activeVehicle(f: Flight) { return f.active === 'upper' && f.upper ? f.upper : f.booster; }
export function addEvent(f: Flight, text: string, tone: 'normal' | 'warn' | 'success' = 'normal') {
  f.events = [{ t: f.t, text, tone }, ...f.events].slice(0, 30);
}
export function separate(f: Flight, c: AerospaceConfig) {
  if (!f.launched || f.separated || ['rud', 'crash', 'landed'].includes(f.booster.phase)) return false;
  const b = f.booster;
  const offset = new Vector3(0, 35, 0).applyQuaternion(b.attitude);
  f.upper = { ...b, id: 'upper', p: b.p.clone().add(offset), v: b.v.clone().addScaledVector(offset.normalize(), 2), attitude: b.attitude.clone(), omega: b.omega.clone(), fuel: 90_000, dryMass: 4_000, throttle: 1, mode: 'gravity', legs: false, fins: false, brakes: false, integral: new Vector3(), gimbal: new Vector3(), maxQ: 0, landingSpeed: null };
  b.throttle = 0; b.mode = 'sas'; b.fins = true;
  f.separated = true; f.active = 'upper';
  addEvent(f, 'Separacja stopni · zapłon stopnia II', 'success');
  return true;
}
export function orbitalElements(p: Vector3, v: Vector3, c: AerospaceConfig) {
  const b = PLANETS[c.body], mu = b.g * b.radius ** 2;
  const r = p.length(), energy = v.lengthSq() / 2 - mu / r;
  const angularMomentum = p.clone().cross(v).lengthSq();
  const e = Math.sqrt(Math.max(0, 1 + 2 * energy * angularMomentum / (mu * mu)));
  const semi = energy < -0.001 ? -mu / (2 * energy) : Infinity;
  const peri = angularMomentum / (mu * (1 + e)) - b.radius;
  const apo = Number.isFinite(semi) ? semi * (1 + e) - b.radius : Infinity;
  return { apoapsis: apo, periapsis: peri };
}
export function telemetry(f: Flight, c: AerospaceConfig, vehicle = activeVehicle(f)): Telemetry {
  const b = PLANETS[c.body], r = vehicle.p.length(), altitude = Math.max(0, r - b.radius - 2);
  const up = vehicle.p.clone().normalize(), vertical = vehicle.v.dot(up);
  const horizontal = Math.sqrt(Math.max(0, vehicle.v.lengthSq() - vertical ** 2));
  const a = atmosphere(c, altitude), isp = specificImpulse(c, a.pressure);
  const attached = !f.separated && vehicle.id === 'booster';
  const mass = vehicle.dryMass + vehicle.fuel + (attached ? 94000 : 0);
  const thrust = vehicle.fuel > 0 ? (vehicle.id === 'upper' ? 950 : c.thrustKN) * 1000 * (isp / PROPELLANTS[c.propellant].sl) * vehicle.throttle : 0;
  const airV = vehicle.v.clone().sub(new Vector3(c.wind + c.gusts * Math.sin(f.t * 1.7 + altitude / 400), 0, c.gusts * Math.sin(f.t * 2.3)));
  const q = 0.5 * a.rho * airV.lengthSq() / 1000;
  const orbit = orbitalElements(vehicle.p, vehicle.v, c);
  const gravity = b.g * (b.radius / r) ** 2;
  const brakingAcc = Math.max(0.01, thrust / mass - gravity);
  const fallTime = (vertical + Math.sqrt(vertical ** 2 + 2 * gravity * altitude)) / gravity;
  return { altitude, speed: vehicle.v.length(), vertical, horizontal, mach: airV.length() / a.sound, q, density: a.rho, pressure: a.pressure, isp, thrust, mass,
    gforce: thrust / mass / G0, deltaV: isp * G0 * Math.log(mass / (vehicle.dryMass + (attached ? 94000 : 0))),
    ...orbit, centrifugal: horizontal ** 2 / r,
    pitch: Math.acos(clamp(new Vector3(0, 1, 0).applyQuaternion(vehicle.attitude).dot(up), -1, 1)) * 180 / Math.PI,
    com: 12 + 10 * vehicle.fuel / (vehicle.id === 'upper' ? 90000 : c.fuelMass), cop: 29,
    impact: vehicle.p.x + vehicle.v.x * fallTime, brakingAltitude: vertical < 0 ? vertical ** 2 / (2 * brakingAcc) : 0,
  };
}
function pidTorque(vehicle: Vehicle, desired: Vector3, dt: number) {
  const nose = new Vector3(0, 1, 0).applyQuaternion(vehicle.attitude);
  const error = nose.clone().cross(desired).applyQuaternion(vehicle.attitude.clone().invert());
  vehicle.integral.addScaledVector(error, dt).clampLength(0, 0.4);
  return error.multiplyScalar(1.6).addScaledVector(vehicle.integral, 0.08).addScaledVector(vehicle.omega, -1.9);
}
function advanceVehicle(f: Flight, c: AerospaceConfig, v: Vehicle, dt: number, input: PilotInput) {
  if (['landed', 'crash', 'rud'].includes(v.phase)) return;
  const b = PLANETS[c.body];
  let m = telemetry(f, c, v);
  v.throttle = clamp(v.throttle + input.throttle * dt * 0.4, 0, 1);
  const up = v.p.clone().normalize();
  let desired = up.clone();
  if (v.mode === 'prograde' && m.speed > 1) desired.copy(v.v).normalize();
  if (v.mode === 'retrograde' && m.speed > 1) desired.copy(v.v).normalize().negate();
  if (v.mode === 'gravity') {
    const tilt = clamp((m.altitude - 150) / 75000, 0, 1) * Math.PI / 2;
    const east = new Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
    desired.multiplyScalar(Math.cos(tilt)).addScaledVector(east, Math.sin(tilt)).normalize();
    // Throttle through Max-Q instead of allowing a nominal gravity turn to disintegrate.
    if (m.q > c.structuralLimit * 0.78) v.throttle = Math.min(v.throttle, 0.65);
    else if (m.q < c.structuralLimit * 0.55) v.throttle = Math.min(1, v.throttle + dt * 0.12);
    if (m.periapsis > ORBIT_HEIGHT) v.throttle = 0;
  }
  if (v.mode === 'landing') {
    const targetX = c.target === 'ship' ? SHIP_DOWNRANGE : 0;
    const ax = clamp((targetX - v.p.x) * 0.008 - v.v.x * 0.18, -3, 3);
    const az = clamp(-v.p.z * 0.008 - v.v.z * 0.18, -3, 3);
    desired.copy(up).add(new Vector3(ax / b.g, 0, az / b.g)).normalize();
    const maxThrust = (v.id === 'upper' ? 950 : c.thrustKN) * 1000 * (m.isp / PROPELLANTS[c.propellant].sl);
    const decel = Math.max(0.1, maxThrust / m.mass - b.g);
    const braking = m.vertical ** 2 / (2 * decel);
    if (m.vertical < 0 && m.altitude < braking * 1.35 + 80) {
      const targetDescent = -Math.min(80, Math.sqrt(Math.max(0, m.altitude) * 1.5));
      const demand = b.g + (targetDescent - m.vertical) * 1.5;
      v.throttle = clamp(demand * m.mass / maxThrust, 0, 1);
      if (m.altitude < 10) v.throttle = clamp((b.g + (-1.5 - m.vertical) * 2) * m.mass / maxThrust, 0, 1);
    } else v.throttle = 0;
    v.fins = m.vertical < 0; v.legs = m.altitude < 800 && m.vertical < 0;
  }
  const manual = new Vector3(input.pitch, input.roll, -input.yaw);
  const commanded = v.mode === 'manual' ? manual.multiplyScalar(0.7) : pidTorque(v, desired, dt).addScaledVector(manual, 0.7);
  const a = atmosphere(c, m.altitude);
  const hasThrust = v.throttle > 0 && v.fuel > 0;
  const authority = hasThrust ? 1 : a.rho > 0.005 && v.fins ? clamp(m.q / 10, 0.1, 0.8) : v.rcsFuel > 0 ? 0.3 : 0;
  v.rcs = !hasThrust && a.rho < 0.005 && v.rcsFuel > 0 ? Math.min(1, commanded.length()) : 0;
  v.rcsFuel = Math.max(0, v.rcsFuel - v.rcs * dt * 0.15);
  v.gimbal.copy(commanded).clampLength(0, 0.09).multiplyScalar(hasThrust ? 1 : 0);
  const torque = commanded.multiplyScalar(authority);
  const nose = new Vector3(0, 1, 0).applyQuaternion(v.attitude);
  const windV = new Vector3(c.wind + c.gusts * Math.sin(f.t * 1.7 + m.altitude / 400), 0, c.gusts * Math.sin(f.t * 2.3));
  const rel = v.v.clone().sub(windV), airSpeed = rel.length();
  // CoP is forward of CoM: restoring/control torque competes with aerodynamic instability.
  if (airSpeed > 1 && m.q > 0) {
    const aero = nose.clone().cross(rel.clone().normalize()).applyQuaternion(v.attitude.clone().invert());
    torque.addScaledVector(aero, Math.min(0.35, m.q * (m.cop - m.com) * 0.0008));
  }
  v.omega.addScaledVector(torque, dt).multiplyScalar(Math.exp(-(v.mode === 'manual' ? 0.12 : 0.35) * dt)).clampLength(0, 2);
  const omegaLen = v.omega.length();
  if (omegaLen > 0.000001) v.attitude.multiply(new Quaternion().setFromAxisAngle(v.omega.clone().normalize(), omegaLen * dt)).normalize();
  m = telemetry(f, c, v);
  const burnt = Math.min(v.fuel, m.thrust / (m.isp * G0) * dt);
  const effectiveThrust = m.thrust * (m.thrust > 0 ? burnt / Math.max(1e-12, m.thrust / (m.isp * G0) * dt) : 0);
  v.fuel -= burnt;
  const dragFactor = c.dragCoef * (v.brakes ? 5 : 1) + (v.fins ? 0.1 : 0);
  const drag = rel.multiplyScalar(-0.5 * a.rho * airSpeed * dragFactor * 10 / m.mass);
  const gravity = up.clone().multiplyScalar(-b.g * (b.radius / v.p.length()) ** 2);
  const thrustDirection = new Vector3(-v.gimbal.z, 1, v.gimbal.x).normalize().applyQuaternion(v.attitude);
  const acc = gravity.add(drag).addScaledVector(thrustDirection, effectiveThrust / m.mass);
  if (v.phase === 'pad' && acc.dot(up) <= 0) {
    v.v.set(0, 0, 0); return;
  }
  v.v.addScaledVector(acc, dt); v.p.addScaledVector(v.v, dt);
  const h = v.p.length() - b.radius - 2;
  v.apogee = Math.max(v.apogee, h);
  v.maxQ = Math.max(v.maxQ, m.q);
  const skinKelvin = v.temperature + 273.15;
  const heat = 0.5 * a.rho * airSpeed ** 3 * 0.025;
  const cooling = 0.8 * 5.67e-8 * (skinKelvin ** 4 - a.temp ** 4);
  v.temperature = Math.max(-120, v.temperature + (heat - cooling) * dt / 22000);
  if (m.q > c.structuralLimit) { v.phase = 'rud'; v.throttle = 0; addEvent(f, `${v.id === 'booster' ? 'I' : 'II'} stopień: RUD · przekroczono ${c.structuralLimit} kPa`, 'warn'); return; }
  if (h <= 0 && v.phase !== 'pad') {
    const touchSpeed = v.v.dot(up), lateral = v.v.clone().addScaledVector(up, -touchSpeed).length();
    const ship = Math.abs(v.p.x - SHIP_DOWNRANGE) < 40 && Math.abs(v.p.z) < 22;
    const pad = Math.hypot(v.p.x, v.p.z) < 45;
    const site = c.target === 'ship' ? ship : pad;
    v.landingSpeed = Math.abs(touchSpeed);
    v.phase = Math.abs(touchSpeed) < 3 && lateral < 3 && v.legs && site && m.pitch < 12 ? 'landed' : 'crash';
    v.p.normalize().multiplyScalar(b.radius + 2); v.v.set(0, 0, 0); v.omega.set(0, 0, 0); v.throttle = 0;
    addEvent(f, v.phase === 'landed' ? 'Miękkie lądowanie · podwozie amortyzuje kontakt' : 'Uderzenie w powierzchnię · utrata pojazdu', v.phase === 'landed' ? 'success' : 'warn'); return;
  }
  const nextPhase: FlightPhase = m.periapsis > ORBIT_HEIGHT ? 'orbit' : m.vertical < 0 ? 'descent' : v.fuel > 0 && v.throttle > 0 ? 'ascent' : 'coast';
  if (nextPhase === 'orbit' && v.phase !== 'orbit') addEvent(f, 'STABILNA ORBITA OSIĄGNIĘTA!', 'success');
  if (v.fuel === 0 && v.phase === 'ascent') addEvent(f, `${v.id === 'booster' ? 'I' : 'II'} stopień: wyczerpanie paliwa · MECO`, 'warn');
  v.phase = nextPhase;
}
export function advanceFlight(f: Flight, c: AerospaceConfig, dt: number, input: PilotInput = ZERO_INPUT) {
  if (!f.running) return;
  f.t += dt;
  advanceVehicle(f, c, f.booster, dt, f.active === 'booster' ? input : ZERO_INPUT);
  if (f.upper) advanceVehicle(f, c, f.upper, dt, f.active === 'upper' ? input : ZERO_INPUT);
  if (['rud', 'crash', 'landed'].includes(f.booster.phase) && (!f.upper || ['rud', 'crash', 'landed'].includes(f.upper.phase))) f.running = false;
}
export function predictTrajectory(f: Flight, c: AerospaceConfig, count = 72) {
  const v = activeVehicle(f), p = v.p.clone(), vel = v.v.clone(), b = PLANETS[c.body];
  const points: Vector3[] = [p.clone()];
  const timeStep = clamp(telemetry(f, c).altitude / 2500, 0.5, 20);
  for (let i = 0; i < count; i++) {
    const r = p.length();
    vel.addScaledVector(p.clone().normalize(), -b.g * (b.radius / r) ** 2 * timeStep);
    const a = atmosphere(c, r - b.radius), speed = vel.length();
    vel.multiplyScalar(Math.exp(-0.5 * a.rho * speed * c.dragCoef * 10 / (v.dryMass + v.fuel) * timeStep));
    p.addScaledVector(vel, timeStep); points.push(p.clone());
    if (p.length() < b.radius + 2) { p.normalize().multiplyScalar(b.radius + 2); break; }
  }
  return points;
}