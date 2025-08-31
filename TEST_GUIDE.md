# Hướng Dẫn Test Time Tracking Extension

## 1. Chuẩn Bị Database

### Tạo bảng time_logs:
```sql
-- Chạy file SQL để tạo bảng
psql -h 100.92.102.97 -U n8n_user -d hrmai -f create_timelogs_table.sql
```

### Hoặc chạy trực tiếp SQL:
```sql
CREATE TABLE IF NOT EXISTS time_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NULL,
    duration_seconds INTEGER NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_time_logs_user_id 
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_start_time ON time_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_time_logs_created_at ON time_logs(created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON time_logs TO n8n_user;
GRANT USAGE, SELECT ON SEQUENCE time_logs_id_seq TO n8n_user;
```

## 2. Khởi Động API Server

```bash
cd /home/aipencil/Timer
node api-server.js
```

Server sẽ chạy trên: `http://timer.aipencil.name.vn`

## 3. Load Extension vào Chrome

1. Mở Chrome và vào `chrome://extensions/`
2. Bật "Developer mode" ở góc phải trên
3. Nhấn "Load unpacked" và chọn thư mục `/home/aipencil/Timer`
4. Extension sẽ được load và xuất hiện icon ở thanh extension

## 4. Test Extension

### Bước 1: Mở website bất kỳ
- Truy cập bất kỳ trang web nào
- Bạn sẽ thấy nút floating màu tím ở góc dưới phải

### Bước 2: Đăng nhập nhân viên
- Nhấn vào nút floating
- Nhập mã nhân viên (VD: AIP001, AIP002, AIP003...)
- Hệ thống sẽ xác minh và hiển thị thông tin nhân viên

### Bước 3: Bắt đầu chấm công
- Nhấn nút "Bắt Đầu"
- Timer sẽ bắt đầu đếm thời gian
- Nút floating sẽ có hiệu ứng pulse

### Bước 4: Kết thúc ca làm việc
- Nhấn nút "Kết Thúc"
- Hệ thống sẽ tính toán thời gian làm việc và gửi về database
- Hiển thị tổng thời gian (giờ và phút)

## 5. Các Thay Đổi Đã Sửa

### ✅ Sửa lỗi timer không tính thời gian:
- Lưu `local_start_time` dưới dạng timestamp để tính toán chính xác
- Sử dụng `getTime()` để có độ chính xác cao
- Tính duration bằng cách: `(endTime - startTime) / 1000`

### ✅ Tạo random session ID:
- Format: `session_${timestamp}_${randomString}`
- Dùng cho việc track session offline
- Database sẽ trả về ID thực từ bảng time_logs

### ✅ Cập nhật API endpoints:
- Thay đổi từ port 3000 → 3006
- API server chạy ổn định

### ✅ Logic database:
- Bắt đầu: INSERT record với start_time
- Kết thúc: UPDATE record với end_time và duration_seconds
- Offline mode: Lưu vào localStorage để sync sau

## 6. Kiểm Tra Database

```sql
-- Xem các record time_logs
SELECT 
    tl.id,
    u.full_name,
    u.employee_code,
    tl.start_time,
    tl.end_time,
    tl.duration_seconds,
    ROUND(tl.duration_seconds / 3600.0, 2) as hours_worked
FROM time_logs tl
JOIN users u ON tl.user_id = u.id
ORDER BY tl.start_time DESC
LIMIT 10;
```

## 7. Troubleshooting

### Nếu extension không hoạt động:
1. Kiểm tra Console trong DevTools (F12)
2. Xem Network tab để kiểm tra API calls
3. Kiểm tra Chrome Extensions page có lỗi không

### Nếu API không kết nối:
1. Kiểm tra API server có chạy không: `curl http://timer.aipencil.name.vn/health`
2. Kiểm tra database connection
3. Xem logs trong terminal chạy API server

### Mock data available:
- AIP001: Đào Khôi Nguyên
- AIP002: Nguyễn Xuân Khang  
- AIP003: Nguyễn Nhật Bảng
- AIP004: Nguyễn Ngọc Tiến Mạnh
- AIP005: Dương Huy Bách
- AIP006: Nguyễn Duy Thái
- AIP007: Lê Quốc Anh
- AIP008: Hoàng Anh Đức
- AIP010: Tạ Trường Sơn
- AIP011: Mai Tô Nhu

## 8. Features Chính

- ✅ Timer chính xác đến từng giây
- ✅ Lưu database tự động
- ✅ Offline mode với sync sau
- ✅ UI đẹp với hiệu ứng
- ✅ Session persistence (giữ trạng thái sau khi reload)
- ✅ Random session ID generation
- ✅ Proper error handling
