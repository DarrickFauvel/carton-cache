import type { Carton } from '@prisma/client'

export type ExtendedCarton = Carton & {
  brand?: string | null
  modelId?: string | null
  location?: string | null
}

export type Unit = 'in' | 'cm'

export interface DimValues { length: number; width: number; height: number }

export interface CartonForm extends DimValues {
  brand: string
  modelId: string
  location: string
  material: string
  condition: string
  quantity: number
  notes: string
}

export const EMPTY_FORM: CartonForm = {
  length: 0, width: 0, height: 0,
  brand: '', modelId: '', location: '', material: '', condition: '', quantity: 1, notes: '',
}

