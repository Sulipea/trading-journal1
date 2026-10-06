import { describe, expect, it } from "vitest";
import { CONTRACT_SPECS, parseContractSymbol, specForSymbol, tickValue } from "./instruments";

describe("parseContractSymbol", () => {
  it("parses supported contract symbols", () => {
    expect(parseContractSymbol("ESZ6")).toEqual({
      symbol: "ESZ6",
      root: "ES",
      monthCode: "Z",
      month: 12,
      year: "6",
    });
    expect(parseContractSymbol(" mnqh27 ")).toMatchObject({ root: "MNQ", month: 3, year: "27" });
  });

  it("distinguishes micro contracts from their minis", () => {
    expect(parseContractSymbol("MESM6")?.root).toBe("MES");
    expect(parseContractSymbol("NQU6")?.root).toBe("NQ");
  });

  it("rejects unsupported or malformed symbols", () => {
    expect(parseContractSymbol("RTYZ6")).toBeNull();
    expect(parseContractSymbol("ESA6")).toBeNull();
    expect(parseContractSymbol("ES")).toBeNull();
    expect(parseContractSymbol("ESZ")).toBeNull();
    expect(parseContractSymbol("ESZ206")).toBeNull();
  });
});

describe("contract specs", () => {
  it("has the correct tick values", () => {
    expect(tickValue(CONTRACT_SPECS.ES)).toBe(12.5);
    expect(tickValue(CONTRACT_SPECS.MES)).toBe(1.25);
    expect(tickValue(CONTRACT_SPECS.NQ)).toBe(5);
    expect(tickValue(CONTRACT_SPECS.MNQ)).toBe(0.5);
  });

  it("looks up a spec from a symbol", () => {
    expect(specForSymbol("NQZ6")).toBe(CONTRACT_SPECS.NQ);
    expect(specForSymbol("XYZ")).toBeNull();
  });
});
