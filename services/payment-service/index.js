import Fastify from 'fastify'
import fs from 'fs/promises'
import path from 'path'

const fastify = Fastify({
  logger: true
})

const PORT = process.env.PORT || 3000
const VERSION = process.env.VERSION || '1.0.0'
const SERVICE_NAME = 'payment-service'
const POD_NAME = process.env.HOSTNAME || 'unknown-pod'
const DATA_DIR = process.env.DATA_DIR || '/data'
const DATA_FILE = path.join(DATA_DIR, 'payments.json')

// Initialize data storage
async function initStorage() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    try {
      await fs.access(DATA_FILE)
    } catch {
      const initialData = {
        podName: POD_NAME,
        createdAt: new Date().toISOString(),
        payments: []
      }
      await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2))
    }
  } catch (err) {
    console.error('Failed to initialize storage:', err)
  }
}

async function loadPayments() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    console.error('Failed to load payments:', err)
    return { podName: POD_NAME, createdAt: new Date().toISOString(), payments: [] }
  }
}

async function savePayments(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('Failed to save payments:', err)
  }
}

// Health check endpoint
fastify.get('/', async (request, reply) => {
  const data = await loadPayments()
  return {
    service: SERVICE_NAME,
    version: VERSION,
    status: 'healthy',
    podName: POD_NAME,
    timestamp: new Date().toISOString(),
    message: `Hello from ${SERVICE_NAME} v${VERSION} on pod ${POD_NAME}!`,
    paymentCount: data.payments.length,
    dataCreatedAt: data.createdAt
  }
})

// Payment endpoints - now with persistent storage
fastify.get('/payments', async (request, reply) => {
  const data = await loadPayments()
  return {
    service: SERVICE_NAME,
    version: VERSION,
    podName: POD_NAME,
    payments: data.payments,
    totalCount: data.payments.length,
    dataSource: `${DATA_FILE} (created: ${data.createdAt})`
  }
})

fastify.get('/payments/:id', async (request, reply) => {
  const data = await loadPayments()
  const payment = data.payments.find(p => p.id === parseInt(request.params.id))
  if (!payment) {
    reply.status(404)
    return { error: 'Payment not found', podName: POD_NAME }
  }
  return {
    service: SERVICE_NAME,
    podName: POD_NAME,
    payment
  }
})

fastify.post('/payments', async (request, reply) => {
  const data = await loadPayments()
  const payment = {
    id: data.payments.length > 0 ? Math.max(...data.payments.map(p => p.id)) + 1 : 1,
    ...request.body,
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: POD_NAME
  }
  
  data.payments.push(payment)
  await savePayments(data)
  
  return {
    service: SERVICE_NAME,
    version: VERSION,
    podName: POD_NAME,
    message: 'Payment created successfully',
    payment
  }
})

fastify.put('/payments/:id', async (request, reply) => {
  const data = await loadPayments()
  const index = data.payments.findIndex(p => p.id === parseInt(request.params.id))
  if (index === -1) {
    reply.status(404)
    return { error: 'Payment not found', podName: POD_NAME }
  }
  
  data.payments[index] = {
    ...data.payments[index],
    ...request.body,
    updatedAt: new Date().toISOString(),
    updatedBy: POD_NAME
  }
  
  await savePayments(data)
  return {
    service: SERVICE_NAME,
    podName: POD_NAME,
    message: 'Payment updated successfully',
    payment: data.payments[index]
  }
})

fastify.delete('/payments/:id', async (request, reply) => {
  const data = await loadPayments()
  const index = data.payments.findIndex(p => p.id === parseInt(request.params.id))
  if (index === -1) {
    reply.status(404)
    return { error: 'Payment not found', podName: POD_NAME }
  }
  
  const deleted = data.payments.splice(index, 1)[0]
  await savePayments(data)
  
  return {
    service: SERVICE_NAME,
    podName: POD_NAME,
    message: 'Payment deleted successfully',
    deleted
  }
})

// Data management endpoints for testing
fastify.get('/data/info', async (request, reply) => {
  const data = await loadPayments()
  return {
    podName: POD_NAME,
    dataFile: DATA_FILE,
    createdAt: data.createdAt,
    paymentCount: data.payments.length,
    lastModified: new Date().toISOString()
  }
})

fastify.delete('/data/reset', async (request, reply) => {
  const initialData = {
    podName: POD_NAME,
    createdAt: new Date().toISOString(),
    payments: []
  }
  await savePayments(initialData)
  
  return {
    podName: POD_NAME,
    message: 'Data reset successfully',
    dataFile: DATA_FILE
  }
})

// Version-specific endpoint
fastify.get('/version', async (request, reply) => {
  return {
    service: SERVICE_NAME,
    version: VERSION,
    buildDate: new Date().toISOString(),
    features: VERSION === '1.0.0' ? ['basic-payments'] : ['basic-payments', 'advanced-analytics']
  }
})

const start = async () => {
  try {
    await initStorage()
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`${SERVICE_NAME} v${VERSION} is running on port ${PORT}`)
    console.log(`Pod: ${POD_NAME}, Data dir: ${DATA_DIR}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()