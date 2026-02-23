import { CartonFormFields } from './CartonFormFields'
import { CartonForm, Unit } from './types'

interface AddCartonFormProps {
  form: CartonForm
  onChange: (f: CartonForm) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  unit: Unit
}

export function AddCartonForm({ form, onChange, onSubmit, unit }: AddCartonFormProps) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-5 gap-4">
        <h2 className="card-title text-base">Add Carton</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <CartonFormFields form={form} onChange={onChange} unit={unit} />
          <div className="card-actions">
            <button className="btn btn-primary btn-sm" type="submit">Add Carton</button>
          </div>
        </form>
      </div>
    </section>
  )
}
