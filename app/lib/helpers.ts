import type { Carton } from '@prisma/client'
import type { CartonForm, Unit, DimValues } from '../components/types'

export function toCm(value: number, unit: Unit) {
  return unit === 'in' ? Number((value * 2.54).toFixed(2)) : value
}

export function formToCm(form: CartonForm, unit: Unit): CartonForm {
  if (unit !== 'in') return form
  return {
    ...form,
    length: toCm(form.length, unit),
    width: toCm(form.width, unit),
    height: toCm(form.height, unit),
  }
}

export function fitsWithRotation(cartonDims: number[], required: number[]) {
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]
  return perms.some(p =>
    required[p[0]] <= cartonDims[0] &&
    required[p[1]] <= cartonDims[1] &&
    required[p[2]] <= cartonDims[2]
  )
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
