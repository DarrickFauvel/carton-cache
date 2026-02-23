import { forwardRef } from 'react'
import { CartonFormFields } from './CartonFormFields'
import { CartonForm, Unit } from './types'

interface EditCartonModalProps {
  form: CartonForm
  onChange: (f: CartonForm) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
  unit: Unit
}

export const EditCartonModal = forwardRef<HTMLDialogElement, EditCartonModalProps>(
  ({ form, onChange, onSubmit, onClose, unit }, ref) => (
    <dialog ref={ref} className="modal">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Edit Carton</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <CartonFormFields form={form} onChange={onChange} unit={unit} />
          <div className="modal-action">
            <button className="btn btn-primary btn-sm" type="submit">Save</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  )
)
EditCartonModal.displayName = 'EditCartonModal'
