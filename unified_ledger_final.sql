-- ==============================================================================
-- FIX: save_purchase_entry Mismatch
-- ==============================================================================

-- 1. Drop the function with all possible signatures to ensure clean slate
DROP FUNCTION IF EXISTS public.save_purchase_entry(UUID, TEXT, DATE, DECIMAL, JSONB);
DROP FUNCTION IF EXISTS public.save_purchase_entry(UUID, TEXT, TEXT, DECIMAL, JSONB); -- in case date was text

-- 2. Re-create with robust signature matching frontend
-- Frontend sends: p_vendor_id, p_invoice_number, p_invoice_date, p_total_amount, p_items
-- We use TEXT for p_invoice_date to be safe, then cast to DATE inside.
CREATE OR REPLACE FUNCTION public.save_purchase_entry(
    p_vendor_id UUID,
    p_invoice_number TEXT,
    p_invoice_date DATE, 
    p_total_amount DECIMAL,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_purchase_id UUID;
    v_item JSONB;
    v_pack_qty INT;
    v_billed_qty INT;
    v_free_qty INT;
    v_total_units INT;
BEGIN
    -- Insert Header
    INSERT INTO public.pharmacy_purchase_invoice (
        vendor_id, invoice_number, invoice_date, total_amount, status
    ) VALUES (
        p_vendor_id, p_invoice_number, p_invoice_date, p_total_amount, 'completed'
    ) RETURNING id INTO v_purchase_id;

    -- Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_pack_qty := COALESCE((v_item->>'pack_size_quantity')::INT, 1);
        v_billed_qty := (v_item->>'quantity')::INT;
        v_free_qty := COALESCE((v_item->>'free_quantity')::INT, 0);
        v_total_units := (v_billed_qty + v_free_qty) * v_pack_qty;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type, stock_flow,
            quantity_billed, quantity_free, total_units, pack_size_quantity,
            mrp, rate_per_unit, total_amount,
            purchase_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INT, v_item->>'batch_number', (v_item->>'expiry_date')::DATE,
            'PURCHASE', 1,
            v_billed_qty, v_free_qty, v_total_units, v_pack_qty,
            (v_item->>'mrp')::DECIMAL, (v_item->>'unit_price')::DECIMAL, (v_item->>'total_amount')::DECIMAL,
            v_purchase_id
        );
    END LOOP;

    RETURN v_purchase_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
