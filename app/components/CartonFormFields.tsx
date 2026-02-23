import { DimFields } from './DimFields'
import { CartonForm, Unit } from './types'

interface CartonFormFieldsProps {
  form: CartonForm
  onChange: (f: CartonForm) => void
  unit: Unit
}

export function CartonFormFields({ form, onChange, unit }: CartonFormFieldsProps) {
  return (
    <div className="space-y-3">
      <DimFields values={form} onChange={v => onChange({ ...form, ...v })} unit={unit} />
      <div className="grid grid-cols-3 gap-3">
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Brand</span></div>
          <input className="input input-bordered input-sm" value={form.brand} onChange={e => onChange({ ...form, brand: e.target.value })} />
        </label>
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Model ID</span></div>
          <input className="input input-bordered input-sm" value={form.modelId} onChange={e => onChange({ ...form, modelId: e.target.value })} />
        </label>
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Location</span></div>
          <input className="input input-bordered input-sm" value={form.location} onChange={e => onChange({ ...form, location: e.target.value })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Material</span></div>
          <input className="input input-bordered input-sm" value={form.material} onChange={e => onChange({ ...form, material: e.target.value })} required />
        </label>
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Condition</span></div>
          <input className="input input-bordered input-sm" value={form.condition} onChange={e => onChange({ ...form, condition: e.target.value })} required />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Quantity</span></div>
          <input className="input input-bordered input-sm" type="number" value={form.quantity} onChange={e => onChange({ ...form, quantity: Number(e.target.value) })} min="1" required />
        </label>
        <label className="form-control">
          <div className="label pb-1"><span className="label-text">Notes</span></div>
          <input className="input input-bordered input-sm" value={form.notes} onChange={e => onChange({ ...form, notes: e.target.value })} />
        </label>
      </div>
    </div>
  )
}
