"use client"
import { useEffect, useState } from 'react'

export default function Page() {
  const [cartons, setCartons] = useState([])
  const [form, setForm] = useState({ length: 0, width: 0, height: 0, material: '', condition: '', quantity: 1, notes: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ length: 0, width: 0, height: 0, material: '', condition: '', quantity: 1, notes: '' })
  const [unit, setUnit] = useState('in')
  const [searchForm, setSearchForm] = useState({ length: 0, width: 0, height: 0 })
  const [matches, setMatches] = useState([])

  useEffect(() => {
    try {
      const s = localStorage.getItem('carton-cache:unit')
      if (s === 'in' || s === 'cm') setUnit(s)
    } catch (e) {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('carton-cache:unit', unit) } catch (e) {}
  }, [unit])

  useEffect(() => {
    fetch('/api/cartons')
      .then(r => r.json())
      .then(setCartons)
  }, [])

  async function add(e) {
    e.preventDefault()
    // Convert inputs to cm for storage if user is using inches
    const payload = { ...form }
    if (unit === 'in') {
      payload.length = Number((form.length * 2.54).toFixed(2))
      payload.width = Number((form.width * 2.54).toFixed(2))
      payload.height = Number((form.height * 2.54).toFixed(2))
    }
    const res = await fetch('/api/cartons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const created = await res.json()
    setCartons(prev => [created, ...prev])
    setForm({ length: 0, width: 0, height: 0, material: '', condition: '', quantity: 1, notes: '' })
  }

  async function remove(id) {
    await fetch(`/api/cartons/${id}`, { method: 'DELETE' })
    setCartons(prev => prev.filter(c => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function startEdit(carton) {
    setEditingId(carton.id)
    // populate edit form in current unit
    const convert = unit === 'in'
      ? v => Number((v / 2.54).toFixed(2))
      : v => v
    setEditForm({ length: convert(carton.length), width: convert(carton.width), height: convert(carton.height), material: carton.material || '', condition: carton.condition || '', quantity: carton.quantity || 1, notes: carton.notes || '' })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(e) {
    e.preventDefault()
    // convert back to cm for storage when needed
    const payload = { ...editForm }
    if (unit === 'in') {
      payload.length = Number((editForm.length * 2.54).toFixed(2))
      payload.width = Number((editForm.width * 2.54).toFixed(2))
      payload.height = Number((editForm.height * 2.54).toFixed(2))
    }
    const res = await fetch(`/api/cartons/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) {
      const updated = await res.json()
      setCartons(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditingId(null)
    } else {
      console.error('Failed to update')
    }
  }

  function fitsWithRotation(cartonDims, requiredDims) {
    // check all permutations of requiredDims against cartonDims
    const perms = [
      [0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]
    ]
    for (const p of perms) {
      if (
        requiredDims[p[0]] <= cartonDims[0] &&
        requiredDims[p[1]] <= cartonDims[1] &&
        requiredDims[p[2]] <= cartonDims[2]
      ) return true
    }
    return false
  }

  function findFits(e) {
    e.preventDefault()
    // convert search dims to cm
    const toCm = v => unit === 'in' ? v * 2.54 : v
    const itemCm = [searchForm.length, searchForm.width, searchForm.height].map(toCm)
    // add 1 inch padding on all sides => +2 inches total per dimension => in cm + 5.08
    const padded = itemCm.map(v => v + 2 * 2.54)

    const found = cartons.filter(c => {
      const cd = [Number(c.length), Number(c.width), Number(c.height)]
      // sort carton dims descending to keep stable orientation? we check permutations anyway
      return fitsWithRotation(cd, padded)
    })
    setMatches(found)
  }

  return (
    <div className="container">
      <h1>Carton Cache</h1>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Add Carton</h2>
        <div>
          <label style={{ marginRight: 8 }}>Units:</label>
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        </div>
      </div>
      <section className="form">
        <form onSubmit={add}>
          <div className="dims-row">
            <div>
              <label>Length</label>
              <input type="number" step={unit === 'in' ? '0.1' : '1'} value={form.length} onChange={e => setForm({ ...form, length: Number(e.target.value) })} onFocus={e => e.target.select()} required />
            </div>
            <div>
              <label>Width</label>
              <input type="number" step={unit === 'in' ? '0.1' : '1'} value={form.width} onChange={e => setForm({ ...form, width: Number(e.target.value) })} onFocus={e => e.target.select()} required />
            </div>
            <div>
              <label>Height</label>
              <input type="number" step={unit === 'in' ? '0.1' : '1'} value={form.height} onChange={e => setForm({ ...form, height: Number(e.target.value) })} onFocus={e => e.target.select()} required />
            </div>
          </div>
          <div>
            <label>Material</label>
            <input value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} required />
          </div>
          <div>
            <label>Condition</label>
            <input value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} required />
          </div>
          <div>
            <label>Quantity</label>
            <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} min="1" required />
          </div>
          <div>
            <label>Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="list">
        <h2>Stored Cartons</h2>
        {cartons.length === 0 && <p>No cartons yet.</p>}
        <ul>
          {cartons.map(c => (
            <li key={c.id} className="carton">
              {editingId === c.id ? (
                <form onSubmit={saveEdit} style={{ flex: 1 }}>
                  <div className="dims-row">
                    <div>
                      <label>Length</label>
                      <input type="number" step={unit === 'in' ? '0.1' : '1'} value={editForm.length} onChange={e => setEditForm({ ...editForm, length: Number(e.target.value) })} onFocus={e => e.target.select()} required />
                    </div>
                    <div>
                      <label>Width</label>
                      <input type="number" step={unit === 'in' ? '0.1' : '1'} value={editForm.width} onChange={e => setEditForm({ ...editForm, width: Number(e.target.value) })} onFocus={e => e.target.select()} required />
                    </div>
                    <div>
                      <label>Height</label>
                      <input type="number" step={unit === 'in' ? '0.1' : '1'} value={editForm.height} onChange={e => setEditForm({ ...editForm, height: Number(e.target.value) })} onFocus={e => e.target.select()} required />
                    </div>
                  </div>
                  <div>
                    <label>Material</label>
                    <input value={editForm.material} onChange={e => setEditForm({ ...editForm, material: e.target.value })} required />
                  </div>
                  <div>
                    <label>Condition</label>
                    <input value={editForm.condition} onChange={e => setEditForm({ ...editForm, condition: e.target.value })} required />
                  </div>
                  <div>
                    <label>Quantity</label>
                    <input type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: Number(e.target.value) })} min="1" required />
                  </div>
                  <div>
                    <label>Notes</label>
                    <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button type="submit">Save</button>
                    <button type="button" onClick={cancelEdit} style={{ marginLeft: 8 }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="meta">
                    <strong>{c.material}</strong> — {c.condition} — qty {c.quantity}
                    <div className="dims">{unit === 'cm' ? `${c.length}×${c.width}×${c.height} cm` : `${(c.length/2.54).toFixed(1)}×${(c.width/2.54).toFixed(1)}×${(c.height/2.54).toFixed(1)} in`}</div>
                  </div>
                  {c.notes && <div className="notes">{c.notes}</div>}
                  <div>
                    <button onClick={() => startEdit(c)}>Edit</button>
                    <button onClick={() => remove(c.id)} style={{ marginLeft: 8 }}>Remove</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="find">
        <h2>Find Fitting Cartons</h2>
        <form onSubmit={findFits} style={{ marginBottom: 12 }}>
          <div className="dims-row">
            <div>
              <label>Item Length</label>
              <input type="number" step={unit === 'in' ? '0.1' : '1'} value={searchForm.length} onChange={e => setSearchForm({ ...searchForm, length: Number(e.target.value) })} onFocus={e => e.target.select()} required />
            </div>
            <div>
              <label>Item Width</label>
              <input type="number" step={unit === 'in' ? '0.1' : '1'} value={searchForm.width} onChange={e => setSearchForm({ ...searchForm, width: Number(e.target.value) })} onFocus={e => e.target.select()} required />
            </div>
            <div>
              <label>Item Height</label>
              <input type="number" step={unit === 'in' ? '0.1' : '1'} value={searchForm.height} onChange={e => setSearchForm({ ...searchForm, height: Number(e.target.value) })} onFocus={e => e.target.select()} required />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="submit">Find</button>
          </div>
        </form>

        <div>
          <h3>Matches</h3>
          {matches.length === 0 && <p>No matches found.</p>}
          <ul>
            {matches.map(m => (
              <li key={`match-${m.id}`} className="carton">
                <div className="meta">
                  <strong>{m.material}</strong> — {m.condition} — qty {m.quantity}
                  <div className="dims">{unit === 'cm' ? `${m.length}×${m.width}×${m.height} cm` : `${(m.length/2.54).toFixed(1)}×${(m.width/2.54).toFixed(1)}×${(m.height/2.54).toFixed(1)} in`}</div>
                </div>
                {m.notes && <div className="notes">{m.notes}</div>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <style jsx>{`
        .container { max-width: 800px; margin: 40px auto; padding: 0 16px; }
        form > div { margin-bottom: 8px }
        .dims-row { display:flex; gap:8px }
        .dims-row > div { flex:1 }
        input { width: 100%; padding: 6px; }
        ul { list-style: none; padding: 0 }
        .carton { border: 1px solid #ddd; padding: 10px; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center }
        .meta { flex:1 }
        button { margin-left: 12px }
      `}</style>
    </div>
  )
}
