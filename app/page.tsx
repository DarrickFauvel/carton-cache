"use client"
import { useEffect, useRef, useState } from 'react'
import type { Carton } from '@prisma/client'
import { CartonTable } from '@/app/components/CartonTable'
import { EditCartonModal } from '@/app/components/EditCartonModal'
import { AddCartonModal } from '@/app/components/AddCartonModal'
import { FindCartonModal } from '@/app/components/FindCartonModal'
import { Navbar } from '@/app/components/Navbar'
import { EMPTY_FORM, type CartonForm, type DimValues, type Unit } from '@/app/components/types'

function toCm(value: number, unit: Unit) {
  return unit === 'in' ? Number((value * 2.54).toFixed(2)) : value
}

function formToCm(form: CartonForm, unit: Unit): CartonForm {
  if (unit !== 'in') return form
  return {
    ...form,
    length: toCm(form.length, unit),
    width: toCm(form.width, unit),
    height: toCm(form.height, unit),
  }
}

function fitsWithRotation(cartonDims: number[], required: number[]) {
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]
  return perms.some(p =>
    required[p[0]] <= cartonDims[0] &&
    required[p[1]] <= cartonDims[1] &&
    required[p[2]] <= cartonDims[2]
  )
}

export default function Page() {
  const [cartons, setCartons] = useState<Carton[]>([])
  const [form, setForm] = useState<CartonForm>(EMPTY_FORM)
  const [editingCarton, setEditingCarton] = useState<Carton | null>(null)
  const [editForm, setEditForm] = useState<CartonForm>(EMPTY_FORM)
  const [unit, setUnit] = useState<Unit>('in')
  const [searchForm, setSearchForm] = useState<DimValues>({ length: 0, width: 0, height: 0 })
  const [matches, setMatches] = useState<Carton[] | null>(null)
  const [isDark, setIsDark] = useState(false)

  // dialog refs for pop-up forms
  const editModalRef = useRef<HTMLDialogElement>(null)
  const addModalRef = useRef<HTMLDialogElement>(null)
  const findModalRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    try { const s = localStorage.getItem('carton-cache:unit'); if (s === 'in' || s === 'cm') setUnit(s) } catch { }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('carton-cache:unit', unit) } catch { }
  }, [unit])
  useEffect(() => {
    try {
      const dark = localStorage.getItem('carton-cache:theme') === 'dark'
      setIsDark(dark)
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    } catch { }
  }, [])
  useEffect(() => {
    fetch('/api/cartons').then(r => r.json()).then(setCartons)
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    try { localStorage.setItem('carton-cache:theme', next ? 'dark' : 'light') } catch { }
  }

  // helpers to open/close modals
  function openAdd() {
    addModalRef.current?.showModal()
  }
  function closeAdd() {
    addModalRef.current?.close()
    setForm(EMPTY_FORM)
  }

  function openFind() {
    findModalRef.current?.showModal()
  }
  function closeFind() {
    findModalRef.current?.close()
    setMatches(null)
    setSearchForm({ length: 0, width: 0, height: 0 })
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const res = await fetch('/api/cartons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToCm(form, unit)),
    })
    const created: Carton = await res.json()
    setCartons(prev => [created, ...prev])
    setForm(EMPTY_FORM)
    closeAdd()
  }

  async function remove(id: number) {
    await fetch(`/api/cartons/${id}`, { method: 'DELETE' })
    setCartons(prev => prev.filter(c => c.id !== id))
  }

  function startEdit(carton: Carton) {
    setEditingCarton(carton)
    const convert = unit === 'in' ? (v: number) => Number((v / 2.54).toFixed(2)) : (v: number) => v
    setEditForm({
      length: convert(carton.length), width: convert(carton.width), height: convert(carton.height),
      material: carton.material, condition: carton.condition, quantity: carton.quantity, notes: carton.notes ?? '',
    })
    editModalRef.current?.showModal()
  }

  function closeEdit() {
    editModalRef.current?.close()
    setEditingCarton(null)
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const res = await fetch(`/api/cartons/${editingCarton!.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToCm(editForm, unit)),
    })
    if (res.ok) {
      const updated: Carton = await res.json()
      setCartons(prev => prev.map(c => c.id === updated.id ? updated : c))
      closeEdit()
    }
  }

  function findFits(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const padded = [searchForm.length, searchForm.width, searchForm.height]
      .map(v => toCm(v, unit) + 2 * 2.54)
    setMatches(cartons.filter(c =>
      fitsWithRotation([Number(c.length), Number(c.width), Number(c.height)], padded)
    ))
  }

  return (
    <>
      <Navbar unit={unit} onUnitChange={setUnit} isDark={isDark} onThemeToggle={toggleTheme} />

      {/* sub-navigation for launching modals */}
      <nav className="flex justify-center gap-2 bg-base-200 border-b border-base-300 px-4 py-2">
        <button className="btn btn-sm" type="button" onClick={openAdd}>Add Carton</button>
        <button className="btn btn-sm btn-secondary" type="button" onClick={openFind}>Find Fit</button>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <CartonTable cartons={cartons} unit={unit} onEdit={startEdit} onDelete={remove} />
      </main>

      <footer className="border-t border-base-300 py-4 text-center text-sm text-base-content/40">
        Carton Cache
      </footer>

      {/* modals for create, find, and edit */}
      <AddCartonModal
        ref={addModalRef}
        form={form}
        onChange={setForm}
        onSubmit={add}
        onClose={closeAdd}
        unit={unit}
      />
      <FindCartonModal
        ref={findModalRef}
        searchForm={searchForm}
        onSearchChange={setSearchForm}
        onSubmit={findFits}
        matches={matches}
        unit={unit}
        onClose={closeFind}
      />
      <EditCartonModal
        ref={editModalRef}
        form={editForm}
        onChange={setEditForm}
        onSubmit={saveEdit}
        onClose={closeEdit}
        unit={unit}
      />
    </>
  )
}
