-- Fix time_logs schema to remove UUID user_id and use only employee_code
-- This resolves the type mismatch between user_new.id (bigint) and time_logs.user_id (uuid)

-- 1. Drop existing triggers and constraints that reference users table
DROP TRIGGER IF EXISTS trigger_validate_time_log_insert ON time_logs;
DROP FUNCTION IF EXISTS validate_time_log_insert();

-- 2. Drop the problematic user_id column
ALTER TABLE time_logs DROP COLUMN IF EXISTS user_id;

-- 3. Ensure employee_code is properly constrained
ALTER TABLE time_logs ALTER COLUMN employee_code SET NOT NULL;

-- 4. Add foreign key constraint to user_new table
ALTER TABLE time_logs 
DROP CONSTRAINT IF EXISTS fk_time_logs_employee_code;

ALTER TABLE time_logs 
ADD CONSTRAINT fk_time_logs_employee_code 
FOREIGN KEY (employee_code) REFERENCES user_new(employee_code);

-- 5. Update unique constraint for active sessions (use employee_code instead of user_id)
DROP INDEX IF EXISTS idx_unique_active_session;
CREATE UNIQUE INDEX idx_unique_active_session 
ON time_logs (employee_code) WHERE end_time IS NULL;

-- 6. Create new validation function (optional - for extra safety)
CREATE OR REPLACE FUNCTION validate_time_log_employee()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure employee_code exists in user_new
    IF NOT EXISTS (
        SELECT 1 FROM user_new 
        WHERE employee_code = NEW.employee_code
    ) THEN
        RAISE EXCEPTION 'Employee code % does not exist', NEW.employee_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for validation
CREATE TRIGGER trigger_validate_time_log_employee
    BEFORE INSERT OR UPDATE ON time_logs
    FOR EACH ROW
    EXECUTE FUNCTION validate_time_log_employee();

-- 8. Show final table structure
\d time_logs
