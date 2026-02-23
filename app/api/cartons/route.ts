import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  const cartons = await prisma.carton.findMany({ orderBy: { createdAt: 'desc' } })
  return Response.json(cartons)
}

export async function POST(req: NextRequest) {
  const { length, width, height, material, condition, quantity, notes } = await req.json()
  try {
    const created = await prisma.carton.create({ data: { length, width, height, material, condition, quantity, notes } })
    return Response.json(created, { status: 201 })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Unable to create carton' }, { status: 500 })
  }
}
