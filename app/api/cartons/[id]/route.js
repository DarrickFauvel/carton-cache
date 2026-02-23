import prisma from '@/lib/prisma.js'

export async function GET(req, { params }) {
  const id = Number(params.id)
  const carton = await prisma.carton.findUnique({ where: { id } })
  return new Response(JSON.stringify(carton), { status: 200, headers: { 'content-type': 'application/json' } })
}

export async function PUT(req, { params }) {
  const id = Number(params.id)
  const data = await req.json()
  const updated = await prisma.carton.update({ where: { id }, data })
  return new Response(JSON.stringify(updated), { status: 200, headers: { 'content-type': 'application/json' } })
}

export async function DELETE(req, { params }) {
  const id = Number(params.id)
  await prisma.carton.delete({ where: { id } })
  return new Response(null, { status: 204 })
}
