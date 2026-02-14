-- 1. Ensure the column exists
ALTER TABLE public.pharmacy_purchase_item 
ADD COLUMN IF NOT EXISTS free_quantity INTEGER NULL DEFAULT 0;

-- 2. Update the RPC Function
CREATE OR REPLACE FUNCTION public.save_purchase_entry(
    p_vendor_id UUID,
    p_invoice_number TEXT,
    p_invoice_date DATE,
    p_total_amount DECIMAL,
    p_items JSONB -- Array of objects: { medicine_id, batch, expiry, qty, free_qty, mrp, rate, total, pack_qty }
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
    v_total_qty INT; -- Billed + Free
BEGIN
    -- 1. Create Purchase Invoice Header
    INSERT INTO public.pharmacy_purchase_invoice (
        vendor_id, invoice_number, invoice_date, total_amount, status
    ) VALUES (
        p_vendor_id, p_invoice_number, p_invoice_date, p_total_amount, 'completed'
    )
    RETURNING id INTO v_purchase_id;

    -- 2. Process Each Item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_pack_qty := COALESCE((v_item->>'pack_size_quantity')::INT, 1);
        v_billed_qty := (v_item->>'quantity')::INT;
        v_free_qty := COALESCE((v_item->>'free_quantity')::INT, 0);
        v_total_qty := v_billed_qty + v_free_qty;

        -- A. Insert Purchase Item Line with Unit Info
        INSERT INTO public.pharmacy_purchase_item (
            purchase_id,
            medicine_id,
            batch_number,
            expiry_date,
            quantity,
            free_quantity,       -- Store free quantity separately
            pack_size_quantity,  -- Store historical pack size
            mrp,
            unit_price,
            total_amount
        ) VALUES (
            v_purchase_id,
            (v_item->>'medicine_id')::INT,
            v_item->>'batch_number',
            (v_item->>'expiry_date')::DATE,
            v_billed_qty,
            v_free_qty,
            v_pack_qty,
            (v_item->>'mrp')::DECIMAL,
            (v_item->>'unit_price')::DECIMAL,
            (v_item->>'total_amount')::DECIMAL
        );

        -- B. Update or Insert Batch Stock (Upsert)
        -- NOTE: Stock Quantity should reflect TOTAL physical packs (Billed + Free)
        INSERT INTO public.pharmacy_batch_stock (
            medicine_id,
            batch_number,
            expiry_date,
            quantity,            -- Total Packs (Billed + Free)
            remaining_units,     -- Total Loose Units (Total Packs * Unit/Pack)
            pack_size_quantity,  -- Latest Unit/Pack def
            mrp,
            purchase_rate
        ) VALUES (
            (v_item->>'medicine_id')::INT,
            v_item->>'batch_number',
            (v_item->>'expiry_date')::DATE,
            v_total_qty,         -- Use Total Qty here
            (v_total_qty * v_pack_qty), -- Calculate initial total units
            v_pack_qty,
            (v_item->>'mrp')::DECIMAL,
            (v_item->>'unit_price')::DECIMAL
        )
        ON CONFLICT (medicine_id, batch_number) 
        DO UPDATE SET
            quantity = public.pharmacy_batch_stock.quantity + EXCLUDED.quantity,
            remaining_units = public.pharmacy_batch_stock.remaining_units + EXCLUDED.remaining_units,
            pack_size_quantity = EXCLUDED.pack_size_quantity, -- Update definition if changed
            mrp = EXCLUDED.mrp,
            purchase_rate = EXCLUDED.purchase_rate,
            updated_at = NOW();

        -- C. Update Master Medicine Definition (if unit/pack changed)
        UPDATE public.clinic_medicine
        SET pack_size_quantity = v_pack_qty,
            updated_at = NOW()
        WHERE id = (v_item->>'medicine_id')::INT
          AND pack_size_quantity != v_pack_qty;
            
    END LOOP;

    RETURN v_purchase_id;
END;
$$;
