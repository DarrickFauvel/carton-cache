import type { Carton } from '@prisma/client'
import { Unit } from './types'
import { conditionBadgeClass, formatDims } from '@/app/lib/helpers'

interface CartonTableProps {
  cartons: Carton[]
  unit: Unit
  onEdit: (c: Carton) => void
  onDelete: (id: number) => void
}

export function CartonTable({ cartons, unit, onEdit, onDelete }: CartonTableProps) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-3">Stored Cartons</h2>
      {cartons.length === 0
        ? <div className="alert"><span className="text-base-content/60">No cartons yet. Add one above.</span></div>
        : (
          <>
            {/* mobile card list */}
            <div className="space-y-2 sm:hidden">
              {cartons.map(c => (
                <div key={c.id} className="card bg-base-100 shadow-sm">
                  <div className="card-body p-3">
                    <h3 className="font-medium text-sm">{c.brand || '-'} / {c.modelId || '-'}</h3>
                    {c.location && <p className="text-sm text-base-content/60">Location: {c.location}</p>}
                    <p className="text-sm">{c.material} · <span className={conditionBadgeClass(c.condition)}>{c.condition}</span></p>
                    <p className="font-mono text-sm">{formatDims(c, unit)}</p>
                    <p className="text-sm">Qty: {c.quantity}</p>
                    {c.notes && <p className="text-sm text-base-content/60 truncate">{c.notes}</p>}
                    <div className="card-actions justify-end mt-2">
                      <button className="btn btn-ghost btn-xs" onClick={() => onEdit(c)}>Edit</button>
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => onDelete(c.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* desktop table */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="table table-sm w-full text-sm">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Model</th>
                    <th>Location</th>
                    <th>Material</th>
                    <th>Condition</th>
                    <th>Dimensions</th>
                    <th>Qty</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cartons.map(c => (
                    <tr key={c.id} className="hover">
                      <td className="font-medium">{c.brand || '-'}</td>
                      <td className="font-medium">{c.modelId || '-'}</td>
                      <td className="font-medium">{c.location || '-'}</td>
                      <td className="font-medium">{c.material}</td>
                      <td>
                        <span className={`badge badge-sm ${conditionBadgeClass(c.condition)}`}>{c.condition}</span>
                      </td>
                      <td className="font-mono">{formatDims(c, unit)}</td>
                      <td>{c.quantity}</td>
                      <td className="text-base-content/60 max-w-[12rem] truncate">{c.notes}</td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button className="btn btn-ghost btn-xs" onClick={() => onEdit(c)}>Edit</button>
                          <button className="btn btn-ghost btn-xs text-error" onClick={() => onDelete(c.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      }
    </section>
  )
}
