import type { Carton } from '@prisma/client'
import { DimFields } from './DimFields'
import { Unit, DimValues, conditionBadgeClass, formatDims } from './types'

interface FindCartonsProps {
  searchForm: DimValues
  onSearchChange: (v: DimValues) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  matches: Carton[] | null
  unit: Unit
}

export function FindCartons({ searchForm, onSearchChange, onSubmit, matches, unit }: FindCartonsProps) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-5 gap-4">
        <h2 className="card-title text-base">Find Fitting Cartons</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <DimFields values={searchForm} onChange={onSearchChange} unit={unit} />
          <div className="card-actions">
            <button className="btn btn-secondary btn-sm" type="submit">Find</button>
          </div>
        </form>

        {matches !== null && (
          <div className="mt-2">
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
    </section>
  )
}
