import type { Carton } from '@prisma/client'

export type Unit = 'in' | 'cm'

export interface DimValues { length: number; width: number; height: number }

export interface CartonForm extends DimValues {
  material: string
  condition: string
  quantity: number
  notes: string
}

export const EMPTY_FORM: CartonForm = {
  length: 0, width: 0, height: 0, material: '', condition: '', quantity: 1, notes: '',
}

export const numStep = (unit: Unit) => unit === 'in' ? '0.1' : '1'

export function conditionBadgeClass(condition: string) {
  const l = condition.toLowerCase()
  if (l === 'new') return 'badge-success'
  if (l === 'damaged') return 'badge-error'
  if (l.includes('used') || l === 'reused') return 'badge-warning'
  return 'badge-neutral'
}

export function formatDims(c: Pick<Carton, 'length' | 'width' | 'height'>, unit: Unit) {
  return unit === 'cm'
    ? `${c.length} × ${c.width} × ${c.height} cm`
    : `${(c.length / 2.54).toFixed(1)} × ${(c.width / 2.54).toFixed(1)} × ${(c.height / 2.54).toFixed(1)} in`
}
