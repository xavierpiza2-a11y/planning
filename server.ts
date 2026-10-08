import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  initDatabase,
  getDatabaseStatus,
  dbGetConfig,
  dbSaveConfig,
  dbGetMonthSchedules,
  dbSaveMonthSchedules,
  dbUpdateShift,
  dbGetDayNotes,
  dbSaveDayNotes,
  dbDeleteMonth,
  dbGetChanges,
  dbClearChanges,
  dbGetHistory,
  dbResetToCleanStore,
  dbGetFullBackup,
  dbRestoreBackup,
} from './src/server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// WEBSOCKET REAL-TIME BROADCAST ENGINE
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

interface ClientInfo {
  ws: WebSocket;
  isAlive: boolean;
  ip: string;
}

const clients = new Set<ClientInfo>();

function broadcast(event: { type: string; entity?: string; [key: string]: any }) {
  const message = JSON.stringify({
    ...event,
    _broadcastTimestamp: Date.now(),
  });

  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
      } catch (err) {
        console.error('WebSocket send error:', err);
      }
    }
  }
}

wss.on('connection', (ws, req) => {
  const client: ClientInfo = {
    ws,
    isAlive: true,
    ip: req.socket.remoteAddress || 'unknown',
  };
  clients.add(client);

  // Send initial welcome & status
  ws.send(
    JSON.stringify({
      type: 'INIT_CONNECTED',
      serverTime: Date.now(),
      dbStatus: getDatabaseStatus(),
    })
  );

  ws.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    clients.delete(client);
  });

  ws.on('error', () => {
    clients.delete(client);
  });
});

// Heartbeat ping interval to keep connection alive
const pingInterval = setInterval(() => {
  for (const client of clients) {
    if (!client.isAlive) {
      client.ws.terminate();
      clients.delete(client);
      continue;
    }
    client.isAlive = false;
    client.ws.ping();
  }
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// ---------------------------------------------------------------------------
// REST API ROUTES
// ---------------------------------------------------------------------------

// Health & Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedClients: clients.size,
    db: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

// 1. Config
app.get('/api/config', async (req, res) => {
  try {
    const config = await dbGetConfig();
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const updated = await dbSaveConfig(req.body);
    broadcast({
      type: 'CONFIG_UPDATED',
      config: updated,
    });
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Month Schedules
app.get('/api/schedules/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    const schedules = await dbGetMonthSchedules(monthKey);
    res.json({ success: true, monthKey, schedules });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/schedules/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    const { teamSchedules } = req.body;
    await dbSaveMonthSchedules(monthKey, teamSchedules || {});
    broadcast({
      type: 'SCHEDULES_UPDATED',
      monthKey,
      teamSchedules,
    });
    res.json({ success: true, monthKey });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Shift Update (Atomic shift modification)
app.post('/api/schedules/:monthKey/shift', async (req, res) => {
  try {
    const { monthKey } = req.params;
    const { employeeName, dateKey, shift, hours, info } = req.body;
    if (!employeeName || !dateKey) {
      return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    }

    const result = await dbUpdateShift(monthKey, employeeName, dateKey, shift, hours, info);
    broadcast({
      type: 'SHIFT_UPDATED',
      monthKey,
      employeeName,
      dateKey,
      shift,
      hours,
      info,
      schedule: result.schedule,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Day Notes
app.get('/api/notes/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    const notes = await dbGetDayNotes(monthKey);
    res.json({ success: true, monthKey, notes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notes/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    const { notes } = req.body;
    await dbSaveDayNotes(monthKey, notes || {});
    broadcast({
      type: 'NOTES_UPDATED',
      monthKey,
      notes: notes || {},
    });
    res.json({ success: true, monthKey });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete Month
app.delete('/api/months/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    await dbDeleteMonth(monthKey);
    broadcast({
      type: 'MONTH_DELETED',
      monthKey,
    });
    res.json({ success: true, monthKey });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Changes & Notifications
app.get('/api/changes/:employeeName', async (req, res) => {
  try {
    const { employeeName } = req.params;
    const changes = await dbGetChanges(employeeName);
    res.json({ success: true, employeeName, changes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/changes/:employeeName/clear', async (req, res) => {
  try {
    const { employeeName } = req.params;
    await dbClearChanges(employeeName);
    broadcast({
      type: 'CHANGES_CLEARED',
      employeeName,
    });
    res.json({ success: true, employeeName });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. History
app.get('/api/history/:employeeName', async (req, res) => {
  try {
    const { employeeName } = req.params;
    const history = await dbGetHistory(employeeName);
    res.json({ success: true, employeeName, history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Reset / Blank Slate
app.post('/api/reset', async (req, res) => {
  try {
    const newConfig = await dbResetToCleanStore();
    broadcast({
      type: 'STORE_RESET',
      config: newConfig,
    });
    res.json({ success: true, config: newConfig });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Full Backup Export & Import
app.get('/api/backup', async (req, res) => {
  try {
    const backup = await dbGetFullBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="planning_backup_${Date.now()}.json"`);
    res.json(backup);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backup', async (req, res) => {
  try {
    const updatedConfig = await dbRestoreBackup(req.body);
    broadcast({
      type: 'BACKUP_RESTORED',
      config: updatedConfig,
    });
    res.json({ success: true, message: 'Sauvegarde restaurée avec succès', config: updatedConfig });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// SERVER STARTUP & VITE INTEGRATION
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  await initDatabase();

  if (!isProd) {
    // Development mode: Vite middleware with HMR disabled to prevent WebSocket closed without opened errors in iframe
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve compiled assets
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`WebSocket server active on ws://0.0.0.0:${PORT}/ws`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
