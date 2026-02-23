import { DimValues, Unit, numStep } from './types'

interface DimFieldsProps {
  values: DimValues
  onChange: (v: DimValues) => void
  unit: Unit
}

export function DimFields({ values, onChange, unit }: DimFieldsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {(['length', 'width', 'height'] as const).map(dim => (
        <label key={dim} className="form-control">
          <div className="label pb-1"><span className="label-text capitalize">{dim}</span></div>
          <input
            className="input input-bordered input-sm"
            type="number"
            step={numStep(unit)}
            value={values[dim]}
            onChange={e => onChange({ ...values, [dim]: Number(e.target.value) })}
            onFocus={e => e.target.select()}
            required
          />
        </label>
      ))}
    </div>
  )
}
