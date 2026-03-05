-- Add new status count columns to parade_records
ALTER TABLE parade_records 
ADD COLUMN IF NOT EXISTS pass_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS suspension_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS yet_to_report_count INTEGER DEFAULT 0;

-- Optional: Update existing records to have 0 instead of NULL (if not already handled by DEFAULT)
UPDATE parade_records SET pass_count = 0 WHERE pass_count IS NULL;
UPDATE parade_records SET suspension_count = 0 WHERE suspension_count IS NULL;
UPDATE parade_records SET yet_to_report_count = 0 WHERE yet_to_report_count IS NULL;
