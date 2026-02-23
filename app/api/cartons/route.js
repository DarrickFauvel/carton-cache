import prisma from '@/lib/prisma.js'

export async function GET() {
  const cartons = await prisma.carton.findMany({ orderBy: { createdAt: 'desc' } })
  return new Response(JSON.stringify(cartons), { status: 200, headers: { 'content-type': 'application/json' } })
}

export async function POST(req) {
  const { length, width, height, material, condition, quantity, notes } = await req.json()
  try {
    const created = await prisma.carton.create({ data: { length, width, height, material, condition, quantity, notes } })
    return new Response(JSON.stringify(created), { status: 201, headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Unable to create carton' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
