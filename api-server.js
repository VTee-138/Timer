const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3006;

// Database configuration
const pool = new Pool({
  host: '100.92.102.97',
  database: 'hrmai',
  user: 'n8n_user',
  password: 'n8n_pass',
  port: 5432,
});

// Middleware
app.use(cors());
app.use(express.json());

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    release();
  }
});

// Routes

// POST /api/time-logs - Create new time log entry
app.post('/api/time-logs', async (req, res) => {
  try {
    const { user_id, start_time, end_time, duration_seconds } = req.body;
    
    const query = `
      INSERT INTO time_logs (user_id, start_time, end_time, duration_seconds)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id, start_time, end_time, duration_seconds
    `;
    
    const values = [user_id, start_time, end_time, duration_seconds];
    const result = await pool.query(query, values);
    
    console.log('Time log created:', result.rows[0]);
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error creating time log:', error);
    res.status(500).json({ error: 'Failed to create time log', details: error.message });
  }
});

// PUT /api/time-logs/:id - Update time log entry
app.put('/api/time-logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { end_time, duration_seconds } = req.body;
    
    const query = `
      UPDATE time_logs 
      SET end_time = $1, duration_seconds = $2
      WHERE id = $3
      RETURNING id, user_id, start_time, end_time, duration_seconds
    `;
    
    const values = [end_time, duration_seconds, id];
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Time log not found' });
    }
    
    console.log('Time log updated:', result.rows[0]);
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error updating time log:', error);
    res.status(500).json({ error: 'Failed to update time log', details: error.message });
  }
});

// GET /api/time-logs/:userId - Get time logs for a user
app.get('/api/time-logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT tl.id, tl.user_id, tl.start_time, tl.end_time, tl.duration_seconds,
             u.full_name, u.employee_code
      FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
      WHERE tl.user_id = $1
      ORDER BY tl.start_time DESC
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching time logs:', error);
    res.status(500).json({ error: 'Failed to fetch time logs', details: error.message });
  }
});

// GET /api/users/:employeeCode - Get user by employee code
app.get('/api/users/:employeeCode', async (req, res) => {
  try {
    const { employeeCode } = req.params;
    
    const query = `
      SELECT id, full_name, role, created_at, username, employee_code
      FROM users
      WHERE employee_code = $1
    `;
    
    const result = await pool.query(query, [employeeCode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user', details: error.message });
  }
});

// POST /api/sync-offline - Sync offline time logs
app.post('/api/sync-offline', async (req, res) => {
  try {
    const { offlineLogs } = req.body;
    const results = [];
    
    for (const log of offlineLogs) {
      try {
        if (log.session_id.startsWith('offline_')) {
          // Create new record for offline sessions
          const insertQuery = `
            INSERT INTO time_logs (user_id, start_time, end_time, duration_seconds)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `;
          const insertResult = await pool.query(insertQuery, [
            log.user_id, 
            log.start_time, 
            log.end_time, 
            log.duration_seconds
          ]);
          results.push({ success: true, id: insertResult.rows[0].id });
        } else {
          // Update existing record
          const updateQuery = `
            UPDATE time_logs 
            SET end_time = $1, duration_seconds = $2
            WHERE id = $3
            RETURNING id
          `;
          const updateResult = await pool.query(updateQuery, [
            log.end_time, 
            log.duration_seconds, 
            log.session_id
          ]);
          results.push({ success: true, id: updateResult.rows[0]?.id });
        }
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    res.json({ results });
    
  } catch (error) {
    console.error('Error syncing offline logs:', error);
    res.status(500).json({ error: 'Failed to sync offline logs', details: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  console.log(`Time tracking API server running on http://timer.aipencil.name.vn`);
  console.log('Available endpoints:');
  console.log('  POST   /api/time-logs          - Create time log');
  console.log('  PUT    /api/time-logs/:id      - Update time log');
  console.log('  GET    /api/time-logs/:userId  - Get user time logs');
  console.log('  GET    /api/users/:employeeCode - Get user by employee code');
  console.log('  POST   /api/sync-offline       - Sync offline data');
  console.log('  GET    /health                 - Health check');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await pool.end();
  process.exit(0);
});
