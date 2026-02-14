-- 1. Create the View to replace the old table
CREATE OR REPLACE VIEW public.pharmacy_batch_stock AS
SELECT 
    -- We can generate a pseudo-ID if needed, but medicine_id+batch is unique enough for grouping
    min(id) as id, -- Dummy ID to satisfy some ORMS, though Supabase is fine without if mapped correctly
    medicine_id,
    batch_number,
    MIN(expiry_date) as expiry_date,
    SUM(remaining_quantity) as quantity,
    SUM(remaining_units) as remaining_units,
    MAX(pack_size_quantity) as pack_size_quantity,
    MAX(mrp) as mrp,
    MAX(unit_price) as purchase_rate
FROM public.pharmacy_purchase_item
WHERE remaining_units > 0 -- Only show active stock
GROUP BY medicine_id, batch_number;
