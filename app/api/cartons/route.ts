import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import type { ExtendedCarton } from '@/app/components/types'

export async function GET() {
  const cartons = await prisma.carton.findMany({ orderBy: { createdAt: 'desc' } })
  return Response.json(cartons)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as any
  try {
    const created = await prisma.carton.create({
      data: body
    })
    return Response.json(created, { status: 201 })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Unable to create carton' }, { status: 500 })
  }
}
