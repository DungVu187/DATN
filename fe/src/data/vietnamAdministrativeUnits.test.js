import { describe, expect, it } from "vitest";
import { vietnamAdministrativeUnits } from "./vietnamAdministrativeUnits.js";

describe("vietnamAdministrativeUnits", () => {
  it("contains the current two-level administrative hierarchy", () => {
    const wards = vietnamAdministrativeUnits.flatMap((province) => province.wards);

    expect(vietnamAdministrativeUnits).toHaveLength(34);
    expect(wards).toHaveLength(3321);
    expect(new Set(vietnamAdministrativeUnits.map((province) => province.code)).size).toBe(34);
    expect(new Set(wards.map((ward) => ward.code)).size).toBe(3321);
  });

  it("provides a non-empty ward list for every province", () => {
    vietnamAdministrativeUnits.forEach((province) => {
      expect(province.name).toBeTruthy();
      expect(province.wards.length).toBeGreaterThan(0);
    });
  });
});
