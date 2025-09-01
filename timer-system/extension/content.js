(function() {
  'use strict';

  // Check if button already exists
  if (document.getElementById('time-tracker-button')) {
    return;
  }

  let popupVisible = false;

  // Create floating button
  const floatingButton = document.createElement('div');
  floatingButton.id = 'time-tracker-button';
  floatingButton.title = 'Chấm công';

  // Create popup container
  const popupContainer = document.createElement('div');
  popupContainer.id = 'time-tracker-popup';
  popupContainer.style.display = 'none';

  // Popup HTML content
  popupContainer.innerHTML = `
    <div class="popup-content">
      <div class="header">
        <h2>🕒 Chấm Công Nhân Viên</h2>
        <button class="close-btn" id="closePopup">×</button>
      </div>
      
      <div class="employee-id-section">
        <input type="text" id="employeeIdInput" placeholder="Nhập mã nhân viên (AIP001, AIP002...)..." maxlength="10">
      </div>
      
      <div id="userInfo" style="display: none;">
        <p><strong>👋 Xin chào,</strong> <span id="userName">Guest</span></p>
        <p><small>Mã NV: <span id="employeeId"></span></small></p>
      </div>

      <div id="timerDisplay" style="display: none;">
        <div class="timer-container">
          <div class="timer-text">⏱️ Thời gian làm việc</div>
          <div class="timer-value" id="timerValue">00:00:00</div>
        </div>
      </div>
      
      <div class="actions">
        <button id="startBtn" disabled>
          <span class="btn-text">Bắt Đầu</span>
        </button>
        <button id="endBtn" disabled>
          <span class="btn-text">Kết Thúc</span>
        </button>
      </div>
      
      <div id="statusMessage"></div>
    </div>
  `;

  // Add click handler for floating button
  floatingButton.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopup();
  });

  // Add click handler for close button
  document.addEventListener('click', (e) => {
    if (e.target.id === 'closePopup') {
      hidePopup();
    }
  });

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (popupVisible && 
        !popupContainer.contains(e.target) && 
        !floatingButton.contains(e.target)) {
      hidePopup();
    }
  });

  function togglePopup() {
    if (popupVisible) {
      hidePopup();
    } else {
      showPopup();
    }
  }

  function showPopup() {
    popupContainer.style.display = 'block';
    setTimeout(() => {
      popupContainer.classList.add('show');
    }, 10);
    popupVisible = true;
    initializePopupLogic();
  }

  function hidePopup() {
    popupContainer.classList.remove('show');
    setTimeout(() => {
      popupContainer.style.display = 'none';
    }, 300);
    popupVisible = false;
  }

  // Timer variables
  let timerInterval = null;
  let startTime = null;

  // Helper function to generate UUID v4
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function initializePopupLogic() {
    const startBtn = document.getElementById('startBtn');
    const endBtn = document.getElementById('endBtn');
    const statusMessage = document.getElementById('statusMessage');
    const userNameEl = document.getElementById('userName');
    const employeeIdInput = document.getElementById('employeeIdInput');
    const userInfo = document.getElementById('userInfo');
    const employeeIdEl = document.getElementById('employeeId');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerValue = document.getElementById('timerValue');

    let currentSession = null;

    // Load saved employee data and session
    chrome.storage.local.get(['employeeData', 'currentSession'], async (result) => {
      if (result.employeeData) {
        displayEmployeeInfo(result.employeeData);
        enableButtons();
        employeeIdInput.value = result.employeeData.employee_code;
        
        // Check for active session on server using employee_code
        const activeSession = await checkActiveSession(result.employeeData.employee_code);
        if (activeSession) {
          // Server has active session, restore it
          currentSession = {
            id: activeSession.id,
            user_id: activeSession.user_id,
            employee_code: activeSession.employee_code,
            start_time: activeSession.start_time,
            local_start_time: new Date(activeSession.start_time).getTime()
          };
          
          startTime = new Date(activeSession.start_time);
          updateButtonStates(true);
          showTimer();
          startTimer();
          
          // Update local storage to match server
          chrome.storage.local.set({ currentSession });
          showStatus('🔄 Khôi phục phiên làm việc từ server', 'info');
        }
      }
      
      // Check local session if no server session found
      if (result.currentSession && !currentSession) {
        const localSession = result.currentSession;
        
        // Validate local session has required data
        if (localSession.id && localSession.user_id && localSession.start_time) {
          // For database IDs, verify session still exists on server using employee_code
          if (typeof localSession.id === 'number') {
            const activeSession = await checkActiveSession(result.employeeData.employee_code);
            if (activeSession && activeSession.id === localSession.id) {
              // Local session matches server, restore it
              currentSession = localSession;
              if (localSession.local_start_time) {
                startTime = new Date(localSession.local_start_time);
              } else {
                startTime = new Date(localSession.start_time);
              }
              updateButtonStates(true);
              showTimer();
              startTimer();
            } else {
              // Local session is stale, clear it
              chrome.storage.local.remove(['currentSession']);
              showStatus('⚠️ Phiên làm việc cũ đã hết hạn', 'info');
            }
          } else if (localSession.id.toString().startsWith('offline_')) {
            // Offline session, restore as-is
            currentSession = localSession;
            startTime = localSession.local_start_time ? 
              new Date(localSession.local_start_time) : 
              new Date(localSession.start_time);
            updateButtonStates(true);
            showTimer();
            startTimer();
            showStatus('📱 Chế độ offline - Dữ liệu chưa đồng bộ', 'info');
          }
        } else {
          // Invalid local session, clear it
          chrome.storage.local.remove(['currentSession']);
        }
      }
    });

    // Employee code input handler
    employeeIdInput.addEventListener('input', (e) => {
      const employeeCode = e.target.value.trim().toUpperCase();
      e.target.value = employeeCode; // Auto uppercase
      
      if (employeeCode.length >= 3) {
        verifyEmployee(employeeCode);
      } else {
        hideEmployeeInfo();
        disableButtons();
      }
    });

    employeeIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const employeeCode = e.target.value.trim().toUpperCase();
        if (employeeCode.length >= 3) {
          verifyEmployee(employeeCode);
        }
      }
    });

    // Verify employee using employee_code
    async function verifyEmployee(employeeCode) {
      try {
        showStatus('🔍 Đang xác minh nhân viên...', 'info');
        
        try {
          // Try to fetch from database first
          const response = await fetch(`http://timer.aipencil.name.vn/api/users/${employeeCode}`);
          
          if (response.ok) {
            const employee = await response.json();
            const employeeData = {
              id: employee.id,
              employee_code: employee.employee_code,
              fullName: employee.full_name,
              role: employee.role,
              username: employee.username,
              created_at: employee.created_at
            };

            chrome.storage.local.set({ employeeData }, () => {
              displayEmployeeInfo(employeeData);
              enableButtons();
              showStatus('✅ Xác minh thành công!', 'success');
            });
            return;
          }
        } catch (apiError) {
          console.log('API not available, using mock data');
        }
        
        // Fallback to mock data if API is not available
        const mockEmployees = {
          'AIP001': { id: 1, full_name: 'Đào Khôi Nguyên', role: 'Dev' },
          'AIP002': { id: 2, full_name: 'Nguyễn Xuân Khang', role: 'Dev' },
          'AIP003': { id: 3, full_name: 'Nguyễn Nhật Bảng', role: 'Dev' },
          'AIP004': { id: 4, full_name: 'Nguyễn Ngọc Tiến Mạnh', role: 'Dev' },
          'AIP005': { id: 5, full_name: 'Dương Huy Bách', role: 'Dev' },
          'AIP006': { id: 6, full_name: 'Nguyễn Duy Thái', role: 'Dev' },
          'AIP007': { id: 7, full_name: 'Lê Quốc Anh', role: 'Dev' },
          'AIP008': { id: 8, full_name: 'Hoàng Anh Đức', role: 'Dev' },
          'AIP010': { id: 10, full_name: 'Tạ Trường Sơn', role: 'Dev' },
          'AIP011': { id: 11, full_name: 'Mai Tô Nhu', role: 'Dev' }
        };

        setTimeout(() => {
          if (mockEmployees[employeeCode]) {
            const employee = mockEmployees[employeeCode];
            const employeeData = {
              id: employee.id,
              employee_code: employeeCode,
              fullName: employee.full_name,
              role: employee.role,
              username: employeeCode.toLowerCase(),
              created_at: new Date().toISOString()
            };

            chrome.storage.local.set({ employeeData }, () => {
              displayEmployeeInfo(employeeData);
              enableButtons();
              showStatus('✅ Xác minh thành công! (mock data)', 'success');
            });
          } else {
            throw new Error('Employee not found');
          }
        }, 500);

      } catch (error) {
        console.error('Error verifying employee:', error);
        showStatus('❌ Không tìm thấy nhân viên với mã này!', 'error');
        hideEmployeeInfo();
        disableButtons();
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

    // Update button states
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
      
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
      }, 3000);
    }

    // Timer functions
    function showTimer() {
      timerDisplay.style.display = 'block';
    }

    function hideTimer() {
      timerDisplay.style.display = 'none';
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    function startTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
      }

      timerInterval = setInterval(() => {
        if (startTime) {
          const now = new Date();
          const elapsed = Math.floor((now - startTime) / 1000);
          
          const hours = Math.floor(elapsed / 3600);
          const minutes = Math.floor((elapsed % 3600) / 60);
          const seconds = elapsed % 60;
          
          timerValue.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
      }, 1000);
    }

        // Database functions với error handling tốt hơn
    async function insertTimeLog(data) {
      try {
        const response = await fetch('http://timer.aipencil.name.vn/api/time-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (!response.ok) {
          // Handle specific error cases
          if (response.status === 409) {
            throw new Error(`User already has an active session: ${result.details || result.error}`);
          }
          throw new Error(`API Error (${response.status}): ${result.error || 'Unknown error'}`);
        }

        // Validate response structure
        if (!result.success || !result.data || !result.data.id || typeof result.data.id !== 'number') {
          throw new Error('Invalid response from server: missing required data');
        }
        
        return result.data;
      } catch (error) {
        console.error('Error inserting time log:', error);
        throw error; // Re-throw to be handled by caller
      }
    }

    async function updateTimeLog(id, endTime, duration) {
      try {
        const response = await fetch(`http://timer.aipencil.name.vn/api/time-logs/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            end_time: endTime,
            duration_seconds: duration
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Time log record not found');
          }
          if (response.status === 409) {
            throw new Error(`Session already completed: ${result.details || result.error}`);
          }
          throw new Error(`API Error (${response.status}): ${result.error || 'Unknown error'}`);
        }

        if (!result.success || !result.data) {
          throw new Error('Invalid response from server');
        }
        
        return result.data;
      } catch (error) {
        console.error('Error updating time log:', error);
        throw error; // Re-throw to be handled by caller
      }
    }

    async function checkActiveSession(employeeCode) {
      try {
        const response = await fetch(`http://timer.aipencil.name.vn/api/users/active-session/${employeeCode}`);
        
        if (!response.ok) {
          throw new Error(`Failed to check active session: ${response.status}`);
        }
        
        const result = await response.json();
        return result.has_active_session ? result.data : null;
      } catch (error) {
        console.error('Error checking active session:', error);
        return null; // Return null on error to avoid blocking
      }
    }

    // Start work session
    startBtn.addEventListener('click', async () => {
      try {
        const startText = startBtn.querySelector('.btn-text');
        startText.innerHTML = '<span class="loading"></span>Đang bắt đầu...';
        startBtn.disabled = true;

        chrome.storage.local.get(['employeeData'], async (result) => {
          if (!result.employeeData) {
            showStatus('❌ Không tìm thấy thông tin nhân viên!', 'error');
            startText.textContent = 'Bắt Đầu';
            startBtn.disabled = false;
            return;
          }

          try {
            // Check if user already has an active session using employee_code
            const existingSession = await checkActiveSession(result.employeeData.employee_code);
            if (existingSession) {
              showStatus('⚠️ Bạn đã có phiên làm việc đang hoạt động!', 'error');
              
              // Restore the existing session
              currentSession = {
                id: existingSession.id,
                user_id: existingSession.user_id,
                employee_code: existingSession.employee_code,
                start_time: existingSession.start_time,
                local_start_time: new Date(existingSession.start_time).getTime()
              };
              
              startTime = new Date(existingSession.start_time);
              chrome.storage.local.set({ currentSession });
              updateButtonStates(true);
              showTimer();
              startTimer();
              floatingButton.classList.add('active');
              
              startText.textContent = 'Bắt Đầu';
              return;
            }

            startTime = new Date();
            const startTimeISO = startTime.toISOString();
            
            // Create time log data
            // Note: time_logs.user_id expects UUID, but we only have user_new.id as bigint
            // Generate a UUID for now since there's no proper FK relationship
            const userUUID = generateUUID();
            
            const timeLogData = {
              user_id: userUUID,
              employee_code: result.employeeData.employee_code,
              start_time: startTimeISO,
              end_time: null,
              duration_seconds: null
            };

            const dbResult = await insertTimeLog(timeLogData);
            
            // Successfully created in database
            currentSession = {
              id: dbResult.id,
              user_id: userUUID, // Use the generated UUID
              employee_code: result.employeeData.employee_code,
              start_time: startTimeISO,
              local_start_time: startTime.getTime()
            };

            chrome.storage.local.set({ currentSession }, () => {
              showStatus('🎯 Đã bắt đầu ca làm việc!', 'success');
              startText.textContent = 'Bắt Đầu';
              updateButtonStates(true);
              showTimer();
              startTimer();
              floatingButton.classList.add('active');
            });

          } catch (dbError) {
            console.error('Database error:', dbError);
            
            // Check if it's a duplicate session error
            if (dbError.message.includes('already has an active session')) {
              showStatus('⚠️ Bạn đã có phiên làm việc đang hoạt động!', 'error');
              startText.textContent = 'Bắt Đầu';
              startBtn.disabled = false;
              return;
            }
            
            // Fallback: create offline session
            startTime = new Date();
            const startTimeISO = startTime.toISOString();
            const userUUID = generateUUID(); // Generate UUID for offline session too
            
            currentSession = {
              id: 'offline_' + Date.now(),
              user_id: userUUID,
              employee_code: result.employeeData.employee_code,
              start_time: startTimeISO,
              local_start_time: startTime.getTime()
            };

            chrome.storage.local.set({ currentSession }, () => {
              showStatus('⚠️ Bắt đầu ca làm việc (chế độ offline)', 'info');
              startText.textContent = 'Bắt Đầu';
              updateButtonStates(true);
              showTimer();
              startTimer();
              floatingButton.classList.add('active');
            });
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

        if (!currentSession || !startTime) {
          showStatus('❌ Không tìm thấy phiên làm việc!', 'error');
          endText.textContent = 'Kết Thúc';
          endBtn.disabled = false;
          return;
        }

        const endTime = new Date();
        const endTimeISO = endTime.toISOString();
        
        // Calculate duration more accurately
        let duration;
        if (currentSession.local_start_time) {
          duration = Math.floor((endTime.getTime() - currentSession.local_start_time) / 1000);
        } else {
          const sessionStartTime = new Date(currentSession.start_time);
          duration = Math.floor((endTime.getTime() - sessionStartTime.getTime()) / 1000);
        }
        
        // Validate duration is reasonable (at least 1 second, max 24 hours)
        if (duration < 1) {
          showStatus('❌ Thời gian làm việc quá ngắn!', 'error');
          endText.textContent = 'Kết Thúc';
          endBtn.disabled = false;
          return;
        }
        
        if (duration > 86400) { // 24 hours
          showStatus('⚠️ Thời gian làm việc vượt quá 24 giờ!', 'error');
        }
        
        console.log(`Session duration: ${duration} seconds (${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m)`);
        
        try {
          // Only update if we have a valid database ID (integer)
          if (currentSession.id && typeof currentSession.id === 'number') {
            const updateResult = await updateTimeLog(currentSession.id, endTimeISO, duration);
            
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            
            showStatus(`🏁 Kết thúc ca làm việc! (${hours}h ${minutes}m) - Đã lưu vào database`, 'success');
            
          } else {
            // Handle offline records
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            
            showStatus(`⚠️ Kết thúc ca làm việc (${hours}h ${minutes}m) - Lưu offline`, 'info');
            
            // Store offline data for later sync
            const offlineData = {
              session_id: currentSession.id,
              user_id: currentSession.user_id,
              employee_code: currentSession.employee_code,
              start_time: currentSession.start_time,
              end_time: endTimeISO,
              duration_seconds: duration,
              timestamp: Date.now()
            };
            
            // Save to local storage for later sync
            chrome.storage.local.get(['offlineTimeLogs'], (result) => {
              const offlineLogs = result.offlineTimeLogs || [];
              offlineLogs.push(offlineData);
              chrome.storage.local.set({ offlineTimeLogs }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Error saving offline data:', chrome.runtime.lastError);
                  showStatus('❌ Lỗi lưu dữ liệu offline!', 'error');
                } else {
                  console.log('Offline data saved successfully:', offlineData);
                }
              });
            });
          }
          
        } catch (dbError) {
          console.error('Database error:', dbError);
          
          const hours = Math.floor(duration / 3600);
          const minutes = Math.floor((duration % 3600) / 60);
          
          if (dbError.message.includes('already completed')) {
            showStatus(`⚠️ Phiên làm việc đã kết thúc trước đó (${hours}h ${minutes}m)`, 'info');
          } else {
            showStatus(`⚠️ Kết thúc ca làm việc (${hours}h ${minutes}m) - Lưu offline`, 'info');
            
            // Store offline data for later sync
            const offlineData = {
              session_id: currentSession.id,
              user_id: currentSession.user_id,
              employee_code: currentSession.employee_code,
              start_time: currentSession.start_time,
              end_time: endTimeISO,
              duration_seconds: duration,
              timestamp: Date.now()
            };
            
            chrome.storage.local.get(['offlineTimeLogs'], (result) => {
              const offlineLogs = result.offlineTimeLogs || [];
              offlineLogs.push(offlineData);
              chrome.storage.local.set({ offlineTimeLogs }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Error saving offline data:', chrome.runtime.lastError);
                  showStatus('❌ Lỗi lưu dữ liệu offline!', 'error');
                } else {
                  console.log('Offline data saved successfully:', offlineData);
                }
              });
            });
          }
        }
        
        // Clear current session
        currentSession = null;
        startTime = null;
        chrome.storage.local.remove(['currentSession'], () => {
          endText.textContent = 'Kết Thúc';
          updateButtonStates(false);
          hideTimer();
          floatingButton.classList.remove('active');
        });

      } catch (error) {
        console.error('Error ending work session:', error);
        showStatus('❌ Lỗi khi kết thúc ca làm việc!', 'error');
        endBtn.querySelector('.btn-text').textContent = 'Kết Thúc';
        endBtn.disabled = false;
      }
    });

    // Clear employee data (double click)
    userInfo.addEventListener('dblclick', () => {
      chrome.storage.local.remove(['employeeData', 'currentSession'], () => {
        currentSession = null;
        startTime = null;
        hideEmployeeInfo();
        disableButtons();
        hideTimer();
        employeeIdInput.value = '';
        employeeIdInput.style.display = 'block';
        showStatus('🔄 Đã xóa thông tin nhân viên', 'info');
        floatingButton.classList.remove('active');
      });
    });

    // Debug: Show offline data (triple click)
    userInfo.addEventListener('click', (e) => {
      if (e.detail === 3) { // Triple click
        chrome.storage.local.get(['offlineTimeLogs'], (result) => {
          const offlineLogs = result.offlineTimeLogs || [];
          console.log('Offline time logs:', offlineLogs);
          showStatus(`📋 Offline logs: ${offlineLogs.length} records`, 'info');
          
          // Auto-sync if there are offline records
          if (offlineLogs.length > 0) {
            syncOfflineData();
          }
        });
      }
    });

    // Sync offline data to server
    async function syncOfflineData() {
      try {
        showStatus('🔄 Đang đồng bộ dữ liệu offline...', 'info');
        
        chrome.storage.local.get(['offlineTimeLogs'], async (result) => {
          const offlineLogs = result.offlineTimeLogs || [];
          
          if (offlineLogs.length === 0) {
            showStatus('✅ Không có dữ liệu offline cần đồng bộ', 'success');
            return;
          }
          
          try {
            const response = await fetch('http://timer.aipencil.name.vn/api/sync-offline', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ offlineLogs })
            });
            
            const result = await response.json();
            
            if (response.ok) {
              // Clear synced offline data
              chrome.storage.local.remove(['offlineTimeLogs'], () => {
                showStatus(`✅ Đã đồng bộ ${offlineLogs.length} records offline`, 'success');
                console.log('Sync results:', result);
              });
            } else {
              throw new Error(`Sync failed: ${result.error || 'Unknown error'}`);
            }
            
          } catch (syncError) {
            console.error('Sync error:', syncError);
            showStatus('❌ Lỗi đồng bộ dữ liệu offline', 'error');
          }
        });
        
      } catch (error) {
        console.error('Error syncing offline data:', error);
        showStatus('❌ Lỗi đồng bộ dữ liệu offline', 'error');
      }
    }

    // Auto-sync on load if there's internet
    setTimeout(() => {
      chrome.storage.local.get(['offlineTimeLogs'], (result) => {
        const offlineLogs = result.offlineTimeLogs || [];
        if (offlineLogs.length > 0) {
          console.log(`Found ${offlineLogs.length} offline records, attempting auto-sync...`);
          syncOfflineData();
        }
      });
    }, 2000); // Wait 2 seconds after popup load
  }

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #time-tracker-button {
      position: fixed !important;
      bottom: 30px !important;
      right: 30px !important;
      width: 70px !important;
      height: 70px !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4) !important;
      z-index: 999999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: all 0.3s ease !important;
      border: 3px solid rgba(255, 255, 255, 0.2) !important;
    }

    #time-tracker-button:hover {
      transform: translateY(-3px) !important;
      box-shadow: 0 12px 35px rgba(102, 126, 234, 0.6) !important;
    }

    #time-tracker-button::before {
      content: '⏰' !important;
      font-size: 28px !important;
      color: white !important;
    }

    @keyframes pulse {
      0% { box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4) !important; }
      50% { box-shadow: 0 8px 25px rgba(102, 126, 234, 0.7) !important; }
      100% { box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4) !important; }
    }

    #time-tracker-button.active {
      animation: pulse 2s infinite !important;
    }

    #time-tracker-popup {
      position: fixed !important;
      bottom: 120px !important;
      right: 30px !important;
      width: 320px !important;
      background: white !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2) !important;
      z-index: 999998 !important;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
      transform: translateY(20px) scale(0.9) !important;
      opacity: 0 !important;
      transition: all 0.3s ease !important;
    }

    #time-tracker-popup.show {
      transform: translateY(0) scale(1) !important;
      opacity: 1 !important;
    }

    .popup-content {
      padding: 20px !important;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      padding: 15px 20px !important;
      margin: -20px -20px 20px -20px !important;
      border-radius: 12px 12px 0 0 !important;
      position: relative !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    }

    .header h2 {
      margin: 0 !important;
      font-size: 16px !important;
      font-weight: 600 !important;
    }

    .close-btn {
      background: none !important;
      border: none !important;
      color: white !important;
      font-size: 24px !important;
      cursor: pointer !important;
      padding: 0 !important;
      width: 30px !important;
      height: 30px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 50% !important;
      transition: background 0.3s ease !important;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.2) !important;
    }

    #userInfo {
      margin-bottom: 15px !important;
      padding: 12px !important;
      background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%) !important;
      border-radius: 8px !important;
      color: #2d3436 !important;
    }

    #userInfo p {
      margin: 0 !important;
      font-size: 14px !important;
      font-weight: 500 !important;
    }

    #userName {
      font-weight: 700 !important;
      color: #e17055 !important;
    }

    .employee-id-section {
      margin-bottom: 15px !important;
    }

    #employeeIdInput {
      width: 100% !important;
      padding: 10px 15px !important;
      border: 2px solid #ddd !important;
      border-radius: 20px !important;
      font-size: 14px !important;
      text-align: center !important;
      box-sizing: border-box !important;
      outline: none !important;
      transition: border-color 0.3s ease !important;
    }

    #employeeIdInput:focus {
      border-color: #667eea !important;
    }

    .timer-container {
      margin: 15px 0 !important;
      padding: 15px !important;
      background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%) !important;
      border-radius: 10px !important;
      text-align: center !important;
      color: white !important;
    }

    .timer-text {
      font-size: 12px !important;
      margin-bottom: 5px !important;
      opacity: 0.9 !important;
    }

    .timer-value {
      font-size: 24px !important;
      font-weight: bold !important;
      font-family: 'Courier New', monospace !important;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
    }

    .actions {
      display: flex !important;
      gap: 10px !important;
      margin: 15px 0 !important;
    }

    .actions button {
      flex: 1 !important;
      padding: 12px 16px !important;
      border: none !important;
      border-radius: 20px !important;
      cursor: pointer !important;
      color: white !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      transition: all 0.3s ease !important;
    }

    #startBtn {
      background: linear-gradient(135deg, #00b894 0%, #00cec9 100%) !important;
    }

    #startBtn:hover:not(:disabled) {
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 15px rgba(0, 184, 148, 0.4) !important;
    }

    #endBtn {
      background: linear-gradient(135deg, #e17055 0%, #fd79a8 100%) !important;
    }

    #endBtn:hover:not(:disabled) {
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 15px rgba(225, 112, 85, 0.4) !important;
    }

    .actions button:disabled {
      opacity: 0.6 !important;
      cursor: not-allowed !important;
    }

    #statusMessage {
      margin-top: 15px !important;
      font-weight: 600 !important;
      font-size: 12px !important;
      padding: 10px !important;
      border-radius: 6px !important;
      text-align: center !important;
      min-height: 16px !important;
    }

    #statusMessage.success {
      background: linear-gradient(135deg, #00b894, #00cec9) !important;
      color: white !important;
    }

    #statusMessage.error {
      background: linear-gradient(135deg, #e17055, #fd79a8) !important;
      color: white !important;
    }

    #statusMessage.info {
      background: linear-gradient(135deg, #667eea, #764ba2) !important;
      color: white !important;
    }

    .loading {
      display: inline-block !important;
      width: 16px !important;
      height: 16px !important;
      border: 2px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: 50% !important;
      border-top-color: white !important;
      animation: spin 1s ease-in-out infinite !important;
      margin-right: 8px !important;
    }

    @keyframes spin {
      to { transform: rotate(360deg) !important; }
    }
  `;

  // Insert elements
  document.head.appendChild(style);
  document.body.appendChild(floatingButton);
  document.body.appendChild(popupContainer);

  // Check working status and update button
  chrome.storage.local.get(['currentSession'], (result) => {
    if (result.currentSession) {
      floatingButton.classList.add('active');
    }
  });

})();