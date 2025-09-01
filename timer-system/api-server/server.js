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
    const { user_id, employee_code, start_time, end_time, duration_seconds } = req.body;
    
    // Validation
    if (!user_id || !employee_code || !start_time) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['user_id', 'employee_code', 'start_time'] 
      });
    }
    
    // Check if user has an active session (end_time is NULL)
    const activeSessionCheck = await pool.query(
      'SELECT id FROM time_logs WHERE user_id = $1 AND end_time IS NULL',
      [user_id]
    );
    
    if (activeSessionCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'User already has an active session', 
        active_session_id: activeSessionCheck.rows[0].id 
      });
    }
    
    // Verify employee_code matches user - user_id is UUID but user_new.id is bigint
    // For now, skip the user verification since there's a type mismatch
    // TODO: Fix the database schema to make user_id consistent
    
    // Just validate that employee_code exists in user_new table
    const userCheck = await pool.query(
      'SELECT id, employee_code FROM user_new WHERE employee_code = $1',
      [employee_code]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee code not found' });
    }
    
    const query = `
      INSERT INTO time_logs (user_id, employee_code, start_time, end_time, duration_seconds)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, employee_code, start_time, end_time, duration_seconds, created_at
    `;
    
    const values = [user_id, employee_code, start_time, end_time, duration_seconds];
    const result = await pool.query(query, values);
    
    console.log('Time log created:', result.rows[0]);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Time log created successfully'
    });
    
  } catch (error) {
    console.error('Error creating time log:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ 
        error: 'User already has an active session',
        details: 'Please end the current session before starting a new one'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create time log', 
      details: error.message 
    });
  }
});

// PUT /api/time-logs/:id - Update time log entry
app.put('/api/time-logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { end_time, duration_seconds } = req.body;
    
    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid time log ID' });
    }
    
    if (!end_time) {
      return res.status(400).json({ error: 'Missing required field: end_time' });
    }
    
    // Check if record exists and is still active
    const existingRecord = await pool.query(
      'SELECT id, user_id, employee_code, start_time, end_time FROM time_logs WHERE id = $1',
      [id]
    );
    
    if (existingRecord.rows.length === 0) {
      return res.status(404).json({ error: 'Time log not found' });
    }
    
    const record = existingRecord.rows[0];
    
    if (record.end_time !== null) {
      return res.status(409).json({ 
        error: 'Time log already completed',
        completed_at: record.end_time
      });
    }
    
    // Auto-calculate duration if not provided
    let calculatedDuration = duration_seconds;
    if (!calculatedDuration) {
      const startTime = new Date(record.start_time);
      const endTime = new Date(end_time);
      calculatedDuration = Math.floor((endTime - startTime) / 1000);
    }
    
    // Validate duration is positive
    if (calculatedDuration < 0) {
      return res.status(400).json({ 
        error: 'Invalid duration: end time must be after start time',
        start_time: record.start_time,
        end_time: end_time
      });
    }
    
    const query = `
      UPDATE time_logs 
      SET end_time = $1, duration_seconds = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, user_id, employee_code, start_time, end_time, duration_seconds, updated_at
    `;
    
    const values = [end_time, calculatedDuration, id];
    const result = await pool.query(query, values);
    
    console.log('Time log updated:', result.rows[0]);
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Time log updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating time log:', error);
    res.status(500).json({ 
      error: 'Failed to update time log', 
      details: error.message 
    });
  }
});

// GET /api/time-logs/:userId - Get time logs for a user
app.get('/api/time-logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, date_from, date_to } = req.query;
    
    // Validation
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }
    
    let query = `
      SELECT tl.id, tl.user_id, tl.employee_code, tl.start_time, tl.end_time, 
             tl.duration_seconds, tl.created_at, tl.updated_at,
             u.full_name, u.employee_code as user_employee_code,
             CASE 
               WHEN tl.end_time IS NULL THEN 'active'
               ELSE 'completed'
             END as status
      FROM time_logs tl
      LEFT JOIN user_new u ON tl.employee_code = u.employee_code
      WHERE tl.user_id = $1
    `;
    
    const values = [userId];
    let paramIndex = 2;
    
    // Add date filters if provided
    if (date_from) {
      query += ` AND tl.start_time >= $${paramIndex}`;
      values.push(date_from);
      paramIndex++;
    }
    
    if (date_to) {
      query += ` AND tl.start_time <= $${paramIndex}`;
      values.push(date_to);
      paramIndex++;
    }
    
    query += ` ORDER BY tl.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, values);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM time_logs tl
      WHERE tl.user_id = $1
      ${date_from ? 'AND tl.start_time >= $2' : ''}
      ${date_to ? `AND tl.start_time <= $${date_from ? '3' : '2'}` : ''}
    `;
    
    const countValues = [userId];
    if (date_from) countValues.push(date_from);
    if (date_to) countValues.push(date_to);
    
    const countResult = await pool.query(countQuery, countValues);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: (parseInt(offset) + result.rows.length) < parseInt(countResult.rows[0].total)
      }
    });
    
  } catch (error) {
    console.error('Error fetching time logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch time logs', 
      details: error.message 
    });
  }
});

// GET /api/users/:employeeCode - Get user by employee code
app.get('/api/users/:employeeCode', async (req, res) => {
  try {
    const { employeeCode } = req.params;
    
    const query = `
      SELECT id, full_name, role, created_at, username, employee_code
      FROM user_new
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

// GET /api/users/:userId/active-session - Check if user has active session
app.get('/api/users/:userId/active-session', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT tl.id, tl.user_id, tl.employee_code, tl.start_time, tl.created_at,
             u.full_name, u.employee_code as user_employee_code
      FROM time_logs tl
      LEFT JOIN user_new u ON tl.employee_code = u.employee_code
      WHERE tl.user_id = $1 AND tl.end_time IS NULL
      ORDER BY tl.start_time DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        has_active_session: false,
        data: null
      });
    }
    
    res.json({
      success: true,
      has_active_session: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error checking active session:', error);
    res.status(500).json({ 
      error: 'Failed to check active session', 
      details: error.message 
    });
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
            INSERT INTO time_logs (user_id, employee_code, start_time, end_time, duration_seconds)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `;
          const insertResult = await pool.query(insertQuery, [
            log.user_id, 
            log.employee_code,
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
