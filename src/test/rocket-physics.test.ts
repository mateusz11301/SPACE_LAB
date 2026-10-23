import { describe, it, expect } from "vitest";
import { initialState, step, twr, type Config } from "@/lib/rocket-physics";

const base: Config = { dryMass: 10000, fuelMass: 50000, thrustKN: 1000, burnRate: 200, dragCoef: 0.5, body: "earth" };

describe("rocket physics", () => {
  it("computes TWR = thrust / (m*g)", () => {
    expect(twr(base)).toBeCloseTo(1_000_000 / (60000 * 9.81), 5);
  });

  it("rocket with TWR < 1 stays at altitude 0", () => {
    const c = { ...base, thrustKN: 100 };
    let s = initialState(c);
    for (let i = 0; i < 100; i++) s = step(s, c, 0.1);
    expect(s.h).toBe(0);
  });

  it("rocket with TWR > 1 climbs and burns fuel at burnRate", () => {
    let s = initialState(base);
    for (let i = 0; i < 100; i++) s = step(s, base, 0.1);
    expect(s.h).toBeGreaterThan(0);
    expect(s.fuel).toBeCloseTo(50000 - 200 * 10, 3);
  });
});
