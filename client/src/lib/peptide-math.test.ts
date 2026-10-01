import { test } from "node:test";
import assert from "node:assert/strict";
import { toMcg, calcDoses, estimateTotalDoses, type PeptideEntry } from "./peptide-math";

const pep = (amountMg: number, desiredDose: number, doseUnit: PeptideEntry["doseUnit"] = "mcg", name = "BPC-157"): PeptideEntry =>
  ({ name, amountMg, desiredDose, doseUnit });

test("toMcg converts mcg, mg and g", () => {
  assert.equal(toMcg(250, "mcg"), 250);
  assert.equal(toMcg(2.5, "mg"), 2500);
  assert.equal(toMcg(0.001, "g"), 1000);
});

test("5 mg vial in 2 mL, 250 mcg dose on U-100 = 10 units / 0.1 mL", () => {
  const [r] = calcDoses([pep(5, 250)], 2, "U-100");
  assert.equal(r.concentrationMgMl, 2.5);
  assert.equal(r.mcgPerUnit, 25);
  assert.equal(r.unitsPerDose, 10);
  assert.equal(r.mlPerDose, 0.1);
});

test("same dose on a U-40 syringe = 4 units, same 0.1 mL volume", () => {
  const [r] = calcDoses([pep(5, 250)], 2, "U-40");
  assert.equal(r.unitsPerDose, 4);
  assert.equal(r.mlPerDose, 0.1);
});

test("mg doses: 10 mg vial in 2 mL, 0.5 mg dose = 10 units on U-100", () => {
  const [r] = calcDoses([pep(10, 0.5, "mg", "Semaglutide")], 2, "U-100");
  assert.equal(r.concentrationMgMl, 5);
  assert.equal(r.unitsPerDose, 10);
  assert.equal(r.mlPerDose, 0.1);
});

test("units round to 0.1 and volume to 0.001 mL", () => {
  // 5 mg in 3 mL = 1666.67 mcg/mL; 100 mcg = 0.06 mL = 6 units
  const [r] = calcDoses([pep(5, 100)], 3, "U-100");
  assert.equal(r.unitsPerDose, 6);
  assert.equal(r.mlPerDose, 0.06);
  // 5 mg in 3 mL, 333 mcg = 0.1998 mL = 19.98 units
  const [r2] = calcDoses([pep(5, 333)], 3, "U-100");
  assert.equal(r2.unitsPerDose, 20);
  assert.equal(r2.mlPerDose, 0.2);
});

test("blend peptides are each computed from their own amount", () => {
  const results = calcDoses([pep(5, 250, "mcg", "BPC-157"), pep(10, 500, "mcg", "TB-500")], 2, "U-100");
  assert.deepEqual(results.map(r => [r.pepName, r.unitsPerDose]), [["BPC-157", 10], ["TB-500", 10]]);
});

test("no BAC water yields zeros rather than NaN or Infinity", () => {
  const [r] = calcDoses([pep(5, 250)], 0, "U-100");
  for (const v of [r.unitsPerDose, r.mlPerDose, r.mcgPerUnit, r.concentrationMgMl]) {
    assert.equal(v, 0);
  }
});

test("doses per vial is limited by the peptide that runs out first", () => {
  assert.equal(estimateTotalDoses([{ amountMg: 5, desiredDoseMcg: 250 }]), 20);
  assert.equal(estimateTotalDoses([
    { amountMg: 5, desiredDoseMcg: 250 },
    { amountMg: 10, desiredDoseMcg: 250 },
  ]), 20);
  assert.equal(estimateTotalDoses([{ amountMg: 5, desiredDoseMcg: 300 }]), 16);
});

test("doses per vial falls back to 30 with no peptides or a zero dose", () => {
  assert.equal(estimateTotalDoses([]), 30);
  assert.equal(estimateTotalDoses([{ amountMg: 5, desiredDoseMcg: 0 }]), 30);
});
