-- Create timelogs table for tracking employee work hours
-- Make sure to run this SQL script in your PostgreSQL database

-- Drop existing table if it exists (be careful in production!)
-- DROP TABLE IF EXISTS time_logs;

-- Create the time_logs table
CREATE TABLE IF NOT EXISTS time_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NULL,
    duration_seconds INTEGER NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Add foreign key constraint to users table
    CONSTRAINT fk_time_logs_user_id 
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_start_time ON time_logs(start_time);
CREATE INDEX IF NOT EXISTS idx_time_logs_created_at ON time_logs(created_at);

-- Create trigger to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_time_logs_updated_at 
    BEFORE UPDATE ON time_logs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add some sample data for testing (optional)
-- Make sure these user_ids exist in your users table
/*
INSERT INTO time_logs (user_id, start_time, end_time, duration_seconds) VALUES
('a4f77fd-032c-4b3c-8db5-00ef6b39a372', '2024-01-15 09:00:00+07', '2024-01-15 17:30:00+07', 30600),
('8d4b4a43-b8e0-48f6-bd95-0cde0c3a4ea5', '2024-01-15 08:30:00+07', '2024-01-15 17:00:00+07', 30600);
*/

-- Grant permissions to your database user
GRANT SELECT, INSERT, UPDATE, DELETE ON time_logs TO n8n_user;
GRANT USAGE, SELECT ON SEQUENCE time_logs_id_seq TO n8n_user;

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'time_logs' 
ORDER BY ordinal_position;
