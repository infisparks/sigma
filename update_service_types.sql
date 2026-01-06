-- Add 'type' column to zblood_test table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'zblood_test' AND column_name = 'type') THEN
        ALTER TABLE zblood_test ADD COLUMN type text DEFAULT 'blood_test';
    END IF;
END $$;

-- Update existing records to have 'blood_test' as default type where it might be null
UPDATE zblood_test SET type = 'blood_test' WHERE type IS NULL;
