-- 1. Update Purchase Item Table
ALTER TABLE public.pharmacy_purchase_item
ADD COLUMN IF NOT EXISTS pack_size_quantity INTEGER DEFAULT 1;

-- 2. Update Batch Stock Table to track loose units
ALTER TABLE public.pharmacy_batch_stock
ADD COLUMN IF NOT EXISTS pack_size_quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS remaining_units INTEGER DEFAULT 0;

-- 3. Initialize remaining_units for existing stock (Assuming 1:1 for now if data exists)
UPDATE public.pharmacy_batch_stock 
SET remaining_units = quantity * pack_size_quantity 
WHERE remaining_units = 0;
