document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const endBtn = document.getElementById('endBtn');
  const statusMessage = document.getElementById('statusMessage');
  const userNameEl = document.getElementById('userName');
  const employeeIdInput = document.getElementById('employeeIdInput');
  const userInfo = document.getElementById('userInfo');
  const employeeIdEl = document.getElementById('employeeId');

  // Database configuration
  const DB_CONFIG = {
    host: '100.92.102.97',
    database: 'hrmai',
    user: 'n8n_user',
    password: 'n8n_pass',
    port: 5432
  };

  let currentSession = null;

  // Load saved employee data and session
  chrome.storage.local.get(['employeeData', 'currentSession'], (result) => {
    if (result.employeeData) {
      displayEmployeeInfo(result.employeeData);
      enableButtons();
      employeeIdInput.value = result.employeeData.employee_code;
    }
    if (result.currentSession) {
      currentSession = result.currentSession;
      updateButtonStates(true); // Currently working
    }
  });

  // Employee ID input handler
  employeeIdInput.addEventListener('input', (e) => {
    const employeeCode = e.target.value.trim();
    if (employeeCode.length >= 3) {
      verifyEmployee(employeeCode);
    } else {
      hideEmployeeInfo();
      disableButtons();
    }
  });

  employeeIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const employeeCode = e.target.value.trim();
      if (employeeCode.length >= 3) {
        verifyEmployee(employeeCode);
      }
    }
  });

  // Verify employee from database using employee_code
  async function verifyEmployee(employeeCode) {
    try {
      showStatus('🔍 Đang xác minh nhân viên...', 'info');
      
      // Query database using employee_code instead of id
      const employee = await queryDatabase(`
        SELECT id, full_name, role, created_at, username, employee_code 
        FROM users_new 
        WHERE employee_code = $1
      `, [employeeCode]);

      if (employee && employee.length > 0) {
        const employeeData = {
          id: employee[0].id,
          employee_code: employee[0].employee_code,
          fullName: employee[0].full_name || employee[0].username || `Nhân viên ${employeeCode}`,
          role: employee[0].role || 'N/A',
          username: employee[0].username || 'N/A',
          created_at: employee[0].created_at || 'N/A'
        };

        // Save employee data
        chrome.storage.local.set({ employeeData }, () => {
          displayEmployeeInfo(employeeData);
          enableButtons();
          showStatus('✅ Xác minh thành công!', 'success');
        });
      } else {
        throw new Error('Employee not found');
      }

    } catch (error) {
      console.error('Error verifying employee:', error);
      
      // Show error message for invalid employee code
      showStatus('❌ Không tìm thấy nhân viên với mã này!', 'error');
      hideEmployeeInfo();
      disableButtons();
    }
  }

  // Database query function
  async function queryDatabase(query, params = []) {
    try {
      // Since Chrome extensions can't directly connect to PostgreSQL,
      // we'll use a webhook or API endpoint to handle database operations
      const response = await fetch('http://100.92.102.97:5000/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          params,
          config: DB_CONFIG
        })
      });

      if (!response.ok) {
        throw new Error('Database query failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // Insert time log record
  async function insertTimeLog(data) {
    try {
      const query = `
        INSERT INTO time_logs (user_id, start_time, end_time, duration_seconds)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;
      
      const params = [
        data.user_id,
        data.start_time,
        data.end_time,
        data.duration_seconds
      ];

      return await queryDatabase(query, params);
    } catch (error) {
      console.error('Error inserting time log:', error);
      throw error;
    }
  }

  // Update time log record
  async function updateTimeLog(id, endTime, duration) {
    try {
      const query = `
        UPDATE time_logs 
        SET end_time = $1, duration_seconds = $2
        WHERE id = $3
        RETURNING *
      `;
      
      const params = [endTime, duration, id];
      return await queryDatabase(query, params);
    } catch (error) {
      console.error('Error updating time log:', error);
      throw error;
    }
  }

  // Display employee information
  function displayEmployeeInfo(employee) {
    userNameEl.textContent = employee.fullName;
    employeeIdEl.textContent = employee.employee_code;
    userInfo.style.display = 'block';
    employeeIdInput.style.display = 'none';
  }

  // Hide employee information
  function hideEmployeeInfo() {
    userInfo.style.display = 'none';
    employeeIdInput.style.display = 'block';
  }

  // Enable/disable buttons
  function enableButtons() {
    startBtn.disabled = false;
    endBtn.disabled = false;
  }

  function disableButtons() {
    startBtn.disabled = true;
    endBtn.disabled = true;
  }

  // Update button states based on work status
  function updateButtonStates(isWorking) {
    if (isWorking) {
      startBtn.style.opacity = '0.6';
      startBtn.disabled = true;
      endBtn.style.opacity = '1';
      endBtn.disabled = false;
    } else {
      startBtn.style.opacity = '1';
      startBtn.disabled = false;
      endBtn.style.opacity = '0.6';
      endBtn.disabled = true;
    }
  }

  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type;
    
    // Auto clear status after 3 seconds
    setTimeout(() => {
      statusMessage.textContent = '';
      statusMessage.className = '';
    }, 3000);
  }

  // Calculate duration in seconds
  function calculateDuration(startTime, endTime) {
    return Math.floor((new Date(endTime) - new Date(startTime)) / 1000);
  }

  // Start work session
  startBtn.addEventListener('click', async () => {
    try {
      const startText = startBtn.querySelector('.btn-text');
      startText.innerHTML = '<span class="loading"></span>Đang bắt đầu...';
      startBtn.disabled = true;

      chrome.storage.local.get(['employeeData'], async (result) => {
        if (result.employeeData) {
          const startTime = new Date().toISOString();
          
          try {
            // Insert new time log record with user_id (UUID from users table)
            const timeLogResult = await insertTimeLog({
              user_id: result.employeeData.id, // This is the UUID from users table
              start_time: startTime,
              end_time: null,
              duration_seconds: null
            });

            // Create current session
            currentSession = {
              id: timeLogResult[0]?.id || Date.now(), // time_logs table ID
              user_id: result.employeeData.id, // users table UUID
              employee_code: result.employeeData.employee_code,
              start_time: startTime
            };

            // Save current session
            chrome.storage.local.set({ currentSession }, () => {
              showStatus('🎯 Đã bắt đầu ca làm việc!', 'success');
              startText.textContent = 'Bắt Đầu';
              updateButtonStates(true);
            });

          } catch (dbError) {
            console.error('Database error:', dbError);
            
            // Fallback: save to local storage only
            currentSession = {
              id: Date.now(),
              user_id: result.employeeData.id,
              employee_code: result.employeeData.employee_code,
              start_time: startTime
            };

            chrome.storage.local.set({ currentSession }, () => {
              showStatus('⚠️ Bắt đầu ca làm việc (chế độ offline)', 'info');
              startText.textContent = 'Bắt Đầu';
              updateButtonStates(true);
            });
          }
        }
      });

    } catch (error) {
      console.error('Error starting work session:', error);
      showStatus('❌ Lỗi khi bắt đầu ca làm việc!', 'error');
      startBtn.querySelector('.btn-text').textContent = 'Bắt Đầu';
      startBtn.disabled = false;
    }
  });

  // End work session
  endBtn.addEventListener('click', async () => {
    try {
      const endText = endBtn.querySelector('.btn-text');
      endText.innerHTML = '<span class="loading"></span>Đang kết thúc...';
      endBtn.disabled = true;

      if (currentSession) {
        const endTime = new Date().toISOString();
        const duration = calculateDuration(currentSession.start_time, endTime);

        try {
          // Update the existing time log record
          await updateTimeLog(currentSession.id, endTime, duration);
          
          showStatus(`🏁 Kết thúc ca làm việc! (${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m)`, 'success');
          
        } catch (dbError) {
          console.error('Database error:', dbError);
          showStatus(`⚠️ Kết thúc ca làm việc (${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m) - offline`, 'info');
        }

        // Clear current session
        currentSession = null;
        chrome.storage.local.remove(['currentSession'], () => {
          endText.textContent = 'Kết Thúc';
          updateButtonStates(false);
        });

      } else {
        showStatus('❌ Không tìm thấy phiên làm việc!', 'error');
        endText.textContent = 'Kết Thúc';
        endBtn.disabled = false;
      }

    } catch (error) {
      console.error('Error ending work session:', error);
      showStatus('❌ Lỗi khi kết thúc ca làm việc!', 'error');
      endBtn.querySelector('.btn-text').textContent = 'Kết Thúc';
      endBtn.disabled = false;
    }
  });

  // Clear employee data (for testing)
  userInfo.addEventListener('dblclick', () => {
    chrome.storage.local.remove(['employeeData', 'currentSession'], () => {
      currentSession = null;
      hideEmployeeInfo();
      disableButtons();
      employeeIdInput.value = '';
      employeeIdInput.style.display = 'block';
      showStatus('🔄 Đã xóa thông tin nhân viên', 'info');
    });
  });
});