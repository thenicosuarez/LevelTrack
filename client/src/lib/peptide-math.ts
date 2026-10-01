// Reconstitution and dosing math for the peptide calculator. Kept free of
// React so it can be unit-tested: these numbers tell people how much to inject.

export type DoseUnit = "mcg" | "mg" | "g";

export interface PeptideEntry {
  name: string;
  amountMg: number;
  desiredDose: number;
  doseUnit: DoseUnit;
}

export interface CalcResult {
  pepName: string;
  unitsPerDose: number;
  mlPerDose: number;
  mcgPerUnit: number;
  concentrationMgMl: number;
}

export function toMcg(value: number, unit: DoseUnit): number {
  if (unit === "mcg") return value;
  if (unit === "mg") return value * 1000;
  return value * 1_000_000;
}

export function calcDoses(
  peptides: PeptideEntry[],
  bacWaterMl: number,
  syringeType: "U-100" | "U-40",
): CalcResult[] {
  const unitsPerMl = syringeType === "U-100" ? 100 : 40;
  return peptides.map(p => {
    const desiredMcg = toMcg(p.desiredDose, p.doseUnit);
    const mcgPerMl = bacWaterMl > 0 ? (p.amountMg * 1000) / bacWaterMl : 0;
    const concentrationMgMl = bacWaterMl > 0 ? p.amountMg / bacWaterMl : 0;
    const mcgPerUnit = mcgPerMl / unitsPerMl;
    const unitsPerDose = mcgPerUnit > 0 ? desiredMcg / mcgPerUnit : 0;
    const mlPerDose = unitsPerMl > 0 ? unitsPerDose / unitsPerMl : 0;
    return {
      pepName: p.name,
      unitsPerDose: Math.round(unitsPerDose * 10) / 10,
      mlPerDose: Math.round(mlPerDose * 1000) / 1000,
      mcgPerUnit: Math.round(mcgPerUnit * 100) / 100,
      concentrationMgMl: Math.round(concentrationMgMl * 1000) / 1000,
    };
  });
}

export function estimateTotalDoses(peptides: Array<{ amountMg: number; desiredDoseMcg: number }>): number {
  if (!peptides.length) return 30;
  const doses = peptides.map(p =>
    p.desiredDoseMcg > 0 ? Math.floor((p.amountMg * 1000) / p.desiredDoseMcg) : 30
  );
  return Math.min(...doses);
}
