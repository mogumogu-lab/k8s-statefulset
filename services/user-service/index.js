import Fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';

const app = Fastify({
  logger: true
});

const PORT = process.env.PORT || 3000;
const VERSION = process.env.VERSION || '1.0.0';
const SERVICE_NAME = 'user-service';
const POD_NAME = process.env.HOSTNAME || 'unknown-pod';
const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'users.json');

// Initialize data storage
async function initStorage() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(DATA_FILE);
    } catch {
      const initialData = {
        podName: POD_NAME,
        createdAt: new Date().toISOString(),
        users: []
      };
      await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
  } catch (err) {
    console.error('Failed to initialize storage:', err);
  }
}

async function loadUsers() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load users:', err);
    return { podName: POD_NAME, createdAt: new Date().toISOString(), users: [] };
  }
}

async function saveUsers(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save users:', err);
  }
}

// Health check endpoint
app.get('/', async (request, reply) => {
  const data = await loadUsers();
  return {
    service: SERVICE_NAME,
    version: VERSION,
    status: 'healthy',
    podName: POD_NAME,
    timestamp: new Date().toISOString(),
    message: `Hello from ${SERVICE_NAME} v${VERSION} on pod ${POD_NAME}!`,
    userCount: data.users.length,
    dataCreatedAt: data.createdAt
  };
});

// User endpoints - now with persistent storage
app.get('/users', async (request, reply) => {
  const data = await loadUsers();
  return {
    service: SERVICE_NAME,
    version: VERSION,
    podName: POD_NAME,
    users: data.users,
    totalCount: data.users.length,
    dataSource: `${DATA_FILE} (created: ${data.createdAt})`
  };
});

app.get('/users/:id', async (request, reply) => {
  const data = await loadUsers();
  const user = data.users.find(u => u.id === parseInt(request.params.id));
  if (!user) {
    reply.status(404);
    return { error: 'User not found', podName: POD_NAME };
  }
  return {
    service: SERVICE_NAME,
    podName: POD_NAME,
    user
  };
});

app.post('/users', async (request, reply) => {
  const data = await loadUsers();
  const user = {
    id: data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) + 1 : 1,
    ...request.body,
    createdAt: new Date().toISOString(),
    createdBy: POD_NAME
  };
  
  data.users.push(user);
  await saveUsers(data);
  
  return {
    service: SERVICE_NAME,
    version: VERSION,
    podName: POD_NAME,
    message: 'User created successfully',
    user
  };
});

app.put('/users/:id', async (request, reply) => {
  const data = await loadUsers();
  const index = data.users.findIndex(u => u.id === parseInt(request.params.id));
  if (index === -1) {
    reply.status(404);
    return { error: 'User not found', podName: POD_NAME };
  }
  
  data.users[index] = {
    ...data.users[index],
    ...request.body,
    updatedAt: new Date().toISOString(),
    updatedBy: POD_NAME
  };
  
  await saveUsers(data);
  return {
    service: SERVICE_NAME,
    podName: POD_NAME,
    message: 'User updated successfully',
    user: data.users[index]
  };
});

app.delete('/users/:id', async (request, reply) => {
  const data = await loadUsers();
  const index = data.users.findIndex(u => u.id === parseInt(request.params.id));
  if (index === -1) {
    reply.status(404);
    return { error: 'User not found', podName: POD_NAME };
  }
  
  const deleted = data.users.splice(index, 1)[0];
  await saveUsers(data);
  
  return {
    service: SERVICE_NAME,
    podName: POD_NAME,
    message: 'User deleted successfully',
    deleted
  };
});

// Data management endpoints for testing
app.get('/data/info', async (request, reply) => {
  const data = await loadUsers();
  return {
    podName: POD_NAME,
    dataFile: DATA_FILE,
    createdAt: data.createdAt,
    userCount: data.users.length,
    lastModified: new Date().toISOString()
  };
});

app.delete('/data/reset', async (request, reply) => {
  const initialData = {
    podName: POD_NAME,
    createdAt: new Date().toISOString(),
    users: []
  };
  await saveUsers(initialData);
  
  return {
    podName: POD_NAME,
    message: 'Data reset successfully',
    dataFile: DATA_FILE
  };
});

// Version-specific endpoint
app.get('/version', async (request, reply) => {
  return {
    service: SERVICE_NAME,
    version: VERSION,
    buildDate: new Date().toISOString(),
    features: VERSION === '1.0.0' ? ['basic-users'] : ['basic-users', 'user-profiles', 'premium-features']
  };
});

// Stats endpoint (v2 only feature simulation)
app.get('/stats', async (request, reply) => {
  if (VERSION === '1.0.0') {
    return {
      service: SERVICE_NAME,
      version: VERSION,
      error: 'Stats feature not available in v1.0.0'
    };
  }
  
  return {
    service: SERVICE_NAME,
    version: VERSION,
    stats: {
      totalUsers: 1250,
      activeUsers: 890,
      premiumUsers: 234,
      timestamp: new Date().toISOString()
    }
  };
});

const start = async () => {
  try {
    await initStorage();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 ${SERVICE_NAME} v${VERSION} is running on http://0.0.0.0:${PORT}`);
    console.log(`Pod: ${POD_NAME}, Data dir: ${DATA_DIR}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
