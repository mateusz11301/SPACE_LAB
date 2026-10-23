export type BodyId = "earth" | "mars" | "moon";

export interface Body {
  id: BodyId;
  name: string;
  g: number;
  radius: number;
  rho0: number;
  scaleHeight: number;
  skyLow: [number, number, number];
  ground: string;
}

export const BODIES: Record<BodyId, Body> = {
  earth: { id: "earth", name: "Ziemia", g: 9.81, radius: 6_371_000, rho0: 1.225, scaleHeight: 8500, skyLow: [70, 140, 220], ground: "#2c3a2a" },
  mars: { id: "mars", name: "Mars", g: 3.71, radius: 3_389_500, rho0: 0.02, scaleHeight: 11100, skyLow: [200, 130, 90], ground: "#6b3420" },
  moon: { id: "moon", name: "Księżyc", g: 1.62, radius: 1_737_400, rho0: 0, scaleHeight: 1, skyLow: [8, 10, 20], ground: "#5a5a60" },
};

export const ROCKET_AREA = 10; // m²
export const KARMAN = 100_000; // m

export interface Config {
  dryMass: number;
  fuelMass: number;
  thrustKN: number;
  burnRate: number;
  dragCoef: number;
  body: BodyId;
}

export type Phase = "pad" | "ascent" | "coast" | "descent" | "crash" | "landed";

export interface SimState {
  t: number;
  h: number;
  v: number;
  a: number;
  fuel: number;
  apogee: number;
  reachedSpace: boolean;
  phase: Phase;
}

export function initialState(c: Config): SimState {
  return { t: 0, h: 0, v: 0, a: 0, fuel: c.fuelMass, apogee: 0, reachedSpace: false, phase: "pad" };
}

export function twr(c: Config): number {
  return (c.thrustKN * 1000) / ((c.dryMass + c.fuelMass) * BODIES[c.body].g);
}

export function airDensity(body: Body, h: number) {
  return body.rho0 * Math.exp(-Math.max(0, h) / body.scaleHeight);
}

export function gravityAt(body: Body, h: number) {
  const r = body.radius / (body.radius + Math.max(0, h));
  return body.g * r * r;
}

/** Advance simulation by dt seconds (mutates nothing, returns new state). */
export function step(s: SimState, c: Config, dt: number): SimState {
  if (s.phase === "crash" || s.phase === "landed") return s;
  const body = BODIES[c.body];
  let fuel = s.fuel;
  const burning = fuel > 0;
  const thrust = burning ? c.thrustKN * 1000 : 0;
  const m = c.dryMass + fuel;
  const fg = m * gravityAt(body, s.h);
  const fd = 0.5 * airDensity(body, s.h) * s.v * Math.abs(s.v) * c.dragCoef * ROCKET_AREA;
  let a = (thrust - fg - fd) / m;

  // On the pad: can't sink into the ground
  if (s.h <= 0 && s.v <= 0 && a <= 0) {
    if (s.phase === "pad" || !burning) {
      return { ...s, t: s.t + dt, a: 0, v: 0, h: 0, fuel: burning ? Math.max(0, fuel - c.burnRate * dt) : fuel };
    }
  }

  if (burning) fuel = Math.max(0, fuel - c.burnRate * dt);
  let v = s.v + a * dt;
  let h = s.h + v * dt;
  let phase: Phase = burning ? "ascent" : v >= 0 ? "coast" : "descent";

  if (h <= 0 && s.phase !== "pad") {
    phase = Math.abs(v) > 10 ? "crash" : "landed";
    h = 0;
    v = 0;
    a = 0;
  } else if (h < 0) {
    h = 0;
    v = Math.max(0, v);
  }

  const apogee = Math.max(s.apogee, h);
  return { t: s.t + dt, h, v, a, fuel, apogee, reachedSpace: s.reachedSpace || h >= KARMAN, phase };
}
