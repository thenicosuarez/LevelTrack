const KG_PER_LB = 0.453592;

export function lbsToKg(lbs: number): number {
  return Math.round(lbs * KG_PER_LB * 10) / 10;
}

export function kgToLbs(kg: number): number {
  return Math.round((kg / KG_PER_LB) * 10) / 10;
}

export function convertWeight(lbs: number, unit: string): number {
  return unit === "kg" ? lbsToKg(lbs) : lbs;
}

export function formatWeight(lbs: number | null | undefined, unit: string): string {
  if (lbs == null) return "—";
  const val = convertWeight(lbs, unit);
  return `${val} ${unit}`;
}
