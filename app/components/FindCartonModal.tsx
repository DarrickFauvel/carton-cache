import { forwardRef } from 'react'
import type { Carton } from '@prisma/client'
import { DimFields } from './DimFields'
import { Unit, DimValues, conditionBadgeClass, formatDims } from './types'

interface FindCartonModalProps {
  searchForm: DimValues
  onSearchChange: (v: DimValues) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  matches: Carton[] | null
  unit: Unit
  onClose: () => void
}

export const FindCartonModal = forwardRef<HTMLDialogElement, FindCartonModalProps>(
  ({ searchForm, onSearchChange, onSubmit, matches, unit, onClose }, ref) => (
    <dialog ref={ref} className="modal">
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-4">Find Fitting Cartons</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <DimFields values={searchForm} onChange={onSearchChange} unit={unit} />
          <div className="modal-action">
            <button className="btn btn-secondary btn-sm" type="submit">Find</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>Close</button>
          </div>
        </form>

        {matches !== null && (
          <div className="mt-4">
            <div className="divider my-2" />
            {matches.length === 0
              ? <div className="alert alert-warning"><span>No cartons fit those dimensions.</span></div>
              : (
                <>
                  <p className="text-sm text-base-content/60 mb-2">{matches.length} match{matches.length === 1 ? '' : 'es'}</p>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Condition</th>
                          <th>Dimensions</th>
                          <th>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matches.map(m => (
                          <tr key={m.id} className="hover">
                            <td className="font-medium">{m.material}</td>
                            <td><span className={`badge badge-sm ${conditionBadgeClass(m.condition)}`}>{m.condition}</span></td>
                            <td className="font-mono text-xs">{formatDims(m, unit)}</td>
                            <td>{m.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            }
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  )
)
FindCartonModal.displayName = 'FindCartonModal'
