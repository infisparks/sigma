-- Add column to track how many units are in a pack (e.g., 10 tablets per strip)
ALTER TABLE public.clinic_medicine 
ADD COLUMN IF NOT EXISTS pack_size_quantity INTEGER DEFAULT 1;

-- Update existing records to default 1 if null (already handled by default, but ensuring safety)
UPDATE public.clinic_medicine SET pack_size_quantity = 1 WHERE pack_size_quantity IS NULL;
