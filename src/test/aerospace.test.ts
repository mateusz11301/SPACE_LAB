import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { DEFAULT_CONFIG, PROPELLANTS, PLANETS, SHIP_DOWNRANGE, ORBIT_HEIGHT, PLASMA_TEMP, makeFlight, specificImpulse, atmosphere, telemetry, advanceFlight, separate, orbitalElements } from '@/lib/aerospace';

describe('SPACE LAB engineering rules', () => {
  it.each([['kerolox', 282, 311], ['methalox', 330, 360], ['hydrolox', 366, 452]] as const)('%s uses the specified sea-level and vacuum Isp', (propellant, sl, vac) => {
    expect(specificImpulse({ ...DEFAULT_CONFIG, propellant }, 101.3)).toBe(sl);
    expect(specificImpulse({ ...DEFAULT_CONFIG, propellant }, 0)).toBe(vac);
  });
  it('computes dynamic pressure as one half rho v squared in kPa', () => {
    const f = makeFlight(DEFAULT_CONFIG); f.booster.v.set(300, 0, 0);
    expect(telemetry(f, DEFAULT_CONFIG).q).toBeCloseTo(0.5 * 1.225 * 300 ** 2 / 1000, 3);
  });
  it('fails the structure above the specified 45 kPa limit', () => {
    const f = makeFlight(DEFAULT_CONFIG); f.running = true; f.launched = true; f.booster.phase = 'ascent'; f.booster.v.set(300, 1, 0);
    advanceFlight(f, DEFAULT_CONFIG, 0.01);
    expect(DEFAULT_CONFIG.structuralLimit).toBe(45);
    expect(f.booster.phase).toBe('rud');
  });
  it('separates into independently controlled and simulated stages', () => {
    const f = makeFlight(DEFAULT_CONFIG); f.launched = true; f.running = true; f.booster.phase = 'ascent'; f.booster.p.y += 10000;
    expect(separate(f, DEFAULT_CONFIG)).toBe(true); expect(f.active).toBe('upper');
    const upperFuel = f.upper?.fuel; advanceFlight(f, DEFAULT_CONFIG, 0.1);
    expect(f.booster.throttle).toBe(0); expect(f.upper?.fuel).toBeLessThan(upperFuel ?? 0);
    expect(separate(f, DEFAULT_CONFIG)).toBe(false);
  });
  it('recognizes perigee over the 100 km atmospheric boundary', () => {
    const b = PLANETS.earth, r = b.radius + 200000;
    const orbit = orbitalElements(new Vector3(0, r, 0), new Vector3(Math.sqrt(b.g * b.radius ** 2 / r), 0, 0), DEFAULT_CONFIG);
    expect(ORBIT_HEIGHT).toBe(100000); expect(orbit.periapsis).toBeCloseTo(200000, 1);
    expect(orbit.periapsis).toBeGreaterThan(ORBIT_HEIGHT);
  });
  it('accepts a vertical landing below 3 m/s on the deployed legs', () => {
    const c = { ...DEFAULT_CONFIG, target: 'pad' as const }, f = makeFlight(c);
    f.running = true; f.launched = true; f.booster.phase = 'descent'; f.booster.p.y += 0.01; f.booster.v.y = -2;
    f.booster.throttle = 0; f.booster.legs = true; advanceFlight(f, c, 0.01);
    expect(f.booster.phase).toBe('landed');
  });
  it('rejects landing at 3 m/s or above', () => {
    const c = { ...DEFAULT_CONFIG, target: 'pad' as const }, f = makeFlight(c);
    f.running = true; f.launched = true; f.booster.phase = 'descent'; f.booster.p.y += 0.01; f.booster.v.y = -3;
    f.booster.throttle = 0; f.booster.legs = true; advanceFlight(f, c, 0.01);
    expect(f.booster.phase).toBe('crash');
  });
  it('places the drone ship 5 km downrange', () => { expect(SHIP_DOWNRANGE).toBe(5000); });
  it('activates plasma above 800 degrees Celsius', () => { expect(PLASMA_TEMP).toBe(800); });
  it('burns propellant according to thrust / (Isp g0)', () => {
    const f = makeFlight(DEFAULT_CONFIG); f.running = true; f.launched = true;
    const m = telemetry(f, DEFAULT_CONFIG); advanceFlight(f, DEFAULT_CONFIG, 0.01);
    expect(f.booster.fuel).toBeCloseTo(DEFAULT_CONFIG.fuelMass - m.thrust / (m.isp * 9.80665) * 0.01, 2);
  });
  it('has no atmosphere on the Moon', () => { expect(atmosphere({ ...DEFAULT_CONFIG, body: 'moon' }, 0).rho).toBe(0); });
});