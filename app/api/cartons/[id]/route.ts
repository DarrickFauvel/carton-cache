import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

type Params = Promise<{ id: string }>

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id: idStr } = await params
  const carton = await prisma.carton.findUnique({ where: { id: Number(idStr) } })
  return Response.json(carton)
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id: idStr } = await params
  const data = await req.json()
  const updated = await prisma.carton.update({ where: { id: Number(idStr) }, data })
  return Response.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id: idStr } = await params
  await prisma.carton.delete({ where: { id: Number(idStr) } })
  return new Response(null, { status: 204 })
}
