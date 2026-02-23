import type { Carton } from '@prisma/client'
import { Unit, conditionBadgeClass, formatDims } from './types'

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
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
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
                    <td className="font-medium">{c.material}</td>
                    <td>
                      <span className={`badge badge-sm ${conditionBadgeClass(c.condition)}`}>{c.condition}</span>
                    </td>
                    <td className="font-mono text-xs">{formatDims(c, unit)}</td>
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
        )
      }
    </section>
  )
}
