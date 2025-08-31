-- Enhanced database constraints and validations for time_logs
-- This will prevent duplicate and invalid data

-- 1. Add constraints to ensure data integrity
ALTER TABLE time_logs 
ADD CONSTRAINT check_valid_duration 
CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE time_logs 
ADD CONSTRAINT check_end_after_start 
CHECK (end_time IS NULL OR end_time >= start_time);

-- 2. Add unique constraint to prevent multiple active sessions per user
-- Only one session per user can be active (end_time is NULL) at any time
CREATE UNIQUE INDEX idx_unique_active_session 
ON time_logs (user_id) 
WHERE end_time IS NULL;

-- 3. Add function to validate time log data
CREATE OR REPLACE FUNCTION validate_time_log_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure employee_code matches the user's employee_code
    IF NOT EXISTS (
        SELECT 1 FROM users 
        WHERE id = NEW.user_id 
        AND employee_code = NEW.employee_code
    ) THEN
        RAISE EXCEPTION 'Employee code % does not match user %', NEW.employee_code, NEW.user_id;
    END IF;
    
    -- Ensure start_time is not in the future
    IF NEW.start_time > NOW() THEN
        RAISE EXCEPTION 'Start time cannot be in the future';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger for validation
CREATE TRIGGER trigger_validate_time_log_insert
    BEFORE INSERT ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION validate_time_log_insert();

-- 5. Add function to auto-calculate duration on update
CREATE OR REPLACE FUNCTION auto_calculate_duration()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-calculate duration if end_time is provided
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::INTEGER;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for auto-calculation
CREATE TRIGGER trigger_auto_calculate_duration
    BEFORE UPDATE ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_duration();

-- 7. Clean up duplicate data (keep only the latest record for each user per day)
WITH ranked_logs AS (
    SELECT 
        id,
        user_id,
        employee_code,
        DATE(start_time) as log_date,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, employee_code, DATE(start_time) 
            ORDER BY start_time DESC
        ) as rn
    FROM time_logs
    WHERE end_time IS NOT NULL  -- Only consider completed sessions
)
DELETE FROM time_logs 
WHERE id IN (
    SELECT id FROM ranked_logs WHERE rn > 1
);

-- 8. Verify the cleanup
SELECT 
    employee_code,
    DATE(start_time) as log_date,
    COUNT(*) as record_count,
    MIN(start_time) as first_start,
    MAX(start_time) as last_start
FROM time_logs 
GROUP BY employee_code, DATE(start_time)
HAVING COUNT(*) > 1
ORDER BY employee_code, log_date;
