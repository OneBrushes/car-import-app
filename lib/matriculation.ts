/** Trámites para matricular en España un coche importado (checklist de inventory_cars.matriculation_checklist). */
export const MATRICULATION_STEPS = [
    { id: "ficha_reducida", label: "Ficha Técnica Reducida (Ingenieros)" },
    { id: "itv", label: "ITV Pasada y Tarjeta Ficha Técnica Original" },
    { id: "hacienda", label: "Impuesto Especial (Mod 576) o Exención" },
    { id: "ayuntamiento", label: "Impuesto de Circulación (Ayto)" },
    { id: "dgt", label: "Tasas DGT y Matriculación" },
    { id: "placas", label: "Placas Físicas Fabricadas" },
] as const

export function matriculationProgress(checklist: Record<string, boolean> | null | undefined): number {
    if (!checklist) return 0
    const done = MATRICULATION_STEPS.filter(step => checklist[step.id]).length
    return Math.round((done / MATRICULATION_STEPS.length) * 100)
}
