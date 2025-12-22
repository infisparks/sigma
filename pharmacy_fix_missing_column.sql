-- Add notes column to pharmacy_sales table
ALTER TABLE public.pharmacy_sales 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Verify and add any other potentially missing columns for robustness
ALTER TABLE public.pharmacy_sales 
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Refresh schema cache happens automatically on DDL, but good to be explicit
NOTIFY pgrst, 'reload schema';
