-- ==============================================================================
-- FIX: Pharmacy Master Script
-- Includes:
-- 1. Fix purchase_entry param mismatch
-- 2. Fix get_current_stock aggregation
-- 3. Fix save_sales_entry & update_pharmacy_sale (MRP nulls, Returns, updated_at)
-- 4. Add 'quantity' column to ledger to preserve original input quantity
-- ==============================================================================

-- 0. Ensure schema is correct
ALTER TABLE public.pharmacy_sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.pharmacy_purchase_invoice ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.pharmacy_stock_ledger ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;

-- 0.5 DATA FIX: Correct existing USER_RET entries to have 0 flow (Neutral)
UPDATE public.pharmacy_stock_ledger SET stock_flow = 0 WHERE transaction_type = 'USER_RET';

-- 1. Drop old function variants to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_current_stock();
DROP FUNCTION IF EXISTS public.get_current_stock(INTEGER);

-- 2. Improved Stock Calculation
-- Uses 'total_units' as the ground truth source for remaining stock.
CREATE OR REPLACE FUNCTION get_current_stock(p_medicine_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    medicine_id INTEGER,
    batch_number TEXT,
    expiry_date DATE,
    quantity BIGINT,          -- Calculated Packs (Floor)
    remaining_units BIGINT,   -- Actual Loose Units
    pack_size_quantity INTEGER,
    mrp NUMERIC,
    purchase_rate NUMERIC
) 
LANGUAGE plpgsql 
SECURITY DEFINER -- Ensures RLS doesn't hide stock
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.medicine_id,
        l.batch_number,
        min(l.expiry_date) as expiry_date,
        -- Floor of (Total Units / Pack Size) = Full Packs. Handle potential null pack size with default 1.
        FLOOR(SUM(l.total_units * l.stock_flow) / GREATEST(MAX(COALESCE(l.pack_size_quantity, 1)), 1))::BIGINT as quantity,
        -- Exact remaining units
        SUM(l.total_units * l.stock_flow)::BIGINT as remaining_units,
        MAX(l.pack_size_quantity) as pack_size_quantity,
        MAX(l.mrp) as mrp,
        MAX(case when l.transaction_type = 'PURCHASE' then l.rate_per_unit else 0 end) as purchase_rate
    FROM public.pharmacy_stock_ledger l
    WHERE (p_medicine_id IS NULL OR l.medicine_id = p_medicine_id)
      AND l.transaction_type != 'USER_RET' -- Explicitly IGNORE User Returns for Inventory Count
    GROUP BY l.medicine_id, l.batch_number
    HAVING SUM(l.total_units * l.stock_flow) > 0;
END;
$$;

-- ==============================================================================
-- 2.5 FIX: save_purchase_entry & update_purchase_entry (Adding quantity & return support)
-- ==============================================================================
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
    v_is_return BOOLEAN;
    v_trx_type TEXT;
    v_stock_flow INT;
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
        v_is_return := COALESCE((v_item->>'is_return')::BOOLEAN, false);

        IF v_is_return THEN
            v_trx_type := 'PUR_RET';
            v_stock_flow := 0; -- Neutral flow for returns in purchase module
        ELSE
            v_trx_type := 'PURCHASE';
            v_stock_flow := 1;
        END IF;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type, stock_flow,
            quantity_billed, quantity_free, total_units, quantity, pack_size_quantity,
            mrp, rate_per_unit, total_amount,
            purchase_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INT, v_item->>'batch_number', (v_item->>'expiry_date')::DATE,
            v_trx_type, v_stock_flow,
            v_billed_qty, v_free_qty, v_total_units, (v_billed_qty + v_free_qty), v_pack_qty,
            (v_item->>'mrp')::DECIMAL, (v_item->>'unit_price')::DECIMAL, (v_item->>'total_amount')::DECIMAL,
            v_purchase_id
        );
    END LOOP;

    RETURN v_purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_purchase_entry(
    p_purchase_id UUID,
    p_vendor_id UUID,
    p_invoice_number TEXT,
    p_invoice_date DATE, 
    p_total_amount DECIMAL,
    p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_item JSONB;
    v_pack_qty INT;
    v_billed_qty INT;
    v_free_qty INT;
    v_total_units INT;
    v_is_return BOOLEAN;
    v_trx_type TEXT;
    v_stock_flow INT;
BEGIN
    -- Update Header
    UPDATE public.pharmacy_purchase_invoice SET
        vendor_id = p_vendor_id,
        invoice_number = p_invoice_number,
        invoice_date = p_invoice_date,
        total_amount = p_total_amount,
        updated_at = now()
    WHERE id = p_purchase_id;

    -- Clear old ledger entries
    DELETE FROM public.pharmacy_stock_ledger WHERE purchase_invoice_id = p_purchase_id;

    -- Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_pack_qty := COALESCE((v_item->>'pack_size_quantity')::INT, 1);
        v_billed_qty := (v_item->>'quantity')::INT;
        v_free_qty := COALESCE((v_item->>'free_quantity')::INT, 0);
        v_total_units := (v_billed_qty + v_free_qty) * v_pack_qty;
        v_is_return := COALESCE((v_item->>'is_return')::BOOLEAN, false);

        IF v_is_return THEN
            v_trx_type := 'PUR_RET';
            v_stock_flow := 0; -- Neutral flow for returns in purchase module
        ELSE
            v_trx_type := 'PURCHASE';
            v_stock_flow := 1;
        END IF;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type, stock_flow,
            quantity_billed, quantity_free, total_units, quantity, pack_size_quantity,
            mrp, rate_per_unit, total_amount,
            purchase_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INT, v_item->>'batch_number', (v_item->>'expiry_date')::DATE,
            v_trx_type, v_stock_flow,
            v_billed_qty, v_free_qty, v_total_units, (v_billed_qty + v_free_qty), v_pack_qty,
            (v_item->>'mrp')::DECIMAL, (v_item->>'unit_price')::DECIMAL, (v_item->>'total_amount')::DECIMAL,
            p_purchase_id
        );
    END LOOP;
END;
$$;


-- ==============================================================================
-- 3. FIX: save_sales_entry (Billing + Returns + Quantity)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.save_sales_entry(text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text);

CREATE OR REPLACE FUNCTION public.save_sales_entry(
    p_customer_name text, p_customer_phone text, p_patient_id text, 
    p_doctor_name text, p_payment_mode text, p_paid_cash numeric,
    p_paid_online numeric, p_subtotal numeric, p_discount_amount numeric,
    p_final_total numeric, p_items jsonb, p_notes text DEFAULT ''
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_sale_id BIGINT; 
    v_item JSONB; 
    v_qty_needed INTEGER; 
    v_user_qty NUMERIC;
    v_current_stock INTEGER;
    v_is_return BOOLEAN;
    v_trx_type TEXT;
    v_stock_flow INTEGER;
BEGIN
    INSERT INTO public.pharmacy_sales (
        customer_name, customer_phone, patient_id, doctor_name, payment_mode,
        paid_amount_cash, paid_amount_online, subtotal, discount_amount, curr_total, status, notes
    ) VALUES (
        p_customer_name, p_customer_phone, p_patient_id, p_doctor_name, p_payment_mode,
        p_paid_cash, p_paid_online, p_subtotal, p_discount_amount, p_final_total, 'completed', p_notes
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty_needed := (v_item->>'total_units_sold')::INTEGER;
        v_user_qty := (v_item->>'quantity')::NUMERIC;
        v_is_return := COALESCE((v_item->>'is_return')::BOOLEAN, false);

        IF v_is_return THEN
            v_trx_type := 'USER_RET';
            v_stock_flow := 0; -- Net Neutral (Void/Cancel) - Do not add phantom stock
        ELSE
            v_trx_type := 'SALE';
            v_stock_flow := -1; -- Deduct from stock
            
            -- Only check stock sufficiency for Sales, not Returns
            SELECT SUM(total_units * stock_flow) INTO v_current_stock
            FROM public.pharmacy_stock_ledger
            WHERE medicine_id = (v_item->>'medicine_id')::INTEGER AND batch_number = (v_item->>'batch_number');

            IF v_current_stock IS NULL OR v_current_stock < v_qty_needed THEN
                RAISE EXCEPTION 'Insufficient stock for Batch %. Available: %', (v_item->>'batch_number'), COALESCE(v_current_stock, 0);
            END IF;
        END IF;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date, transaction_type, stock_flow,
            total_units, quantity, quantity_mode, pack_size_quantity, 
            mrp, rate_per_unit, total_amount, item_discount, sale_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INTEGER, (v_item->>'batch_number'), (v_item->>'expiry_date')::DATE,
            v_trx_type, v_stock_flow, v_qty_needed, v_user_qty, (v_item->>'quantity_mode'), 
            COALESCE((v_item->>'pack_size_quantity')::INT, 1),
            COALESCE((v_item->>'mrp_per_pack')::NUMERIC, (v_item->>'mrp')::NUMERIC, 0),
            (v_item->>'unit_price')::NUMERIC, (v_item->>'total_price')::NUMERIC,
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0), v_sale_id
        );
    END LOOP;
    RETURN json_build_object('sale_id', v_sale_id, 'status', 'success');
END;
$$;

-- ==============================================================================
-- 4. FIX: update_pharmacy_sale (Editing + Returns + Quantity)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.update_pharmacy_sale(BIGINT, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text);

CREATE OR REPLACE FUNCTION public.update_pharmacy_sale(
    p_sale_id BIGINT, p_customer_name text, p_customer_phone text, p_patient_id text, 
    p_doctor_name text, p_payment_mode text, p_paid_cash numeric,
    p_paid_online numeric, p_subtotal numeric, p_discount_amount numeric,
    p_final_total numeric, p_items jsonb, p_notes text DEFAULT ''
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_item JSONB; 
    v_qty_needed INTEGER; 
    v_user_qty NUMERIC;
    v_current_stock INTEGER;
    v_is_return BOOLEAN;
    v_trx_type TEXT;
    v_stock_flow INTEGER;
BEGIN
    UPDATE public.pharmacy_sales SET
        customer_name = p_customer_name, customer_phone = p_customer_phone,
        patient_id = p_patient_id, doctor_name = p_doctor_name,
        payment_mode = p_payment_mode, paid_amount_cash = p_paid_cash,
        paid_amount_online = p_paid_online, subtotal = p_subtotal,
        discount_amount = p_discount_amount, curr_total = p_final_total,
        notes = p_notes, updated_at = now()
    WHERE id = p_sale_id;

    -- Clear old ledger entries to re-record
    DELETE FROM public.pharmacy_stock_ledger WHERE sale_invoice_id = p_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty_needed := (v_item->>'total_units_sold')::INTEGER;
        v_user_qty := (v_item->>'quantity')::NUMERIC;
        v_is_return := COALESCE((v_item->>'is_return')::BOOLEAN, false);

        IF v_is_return THEN
            v_trx_type := 'USER_RET';
            v_stock_flow := 0; -- Net Neutral (Void/Cancel) - Do not add phantom stock
        ELSE
            v_trx_type := 'SALE';
            v_stock_flow := -1; -- Deduct from stock
            
            -- Only check stock sufficiency for Sales, not Returns
            SELECT SUM(total_units * stock_flow) INTO v_current_stock
            FROM public.pharmacy_stock_ledger
            WHERE medicine_id = (v_item->>'medicine_id')::INTEGER AND batch_number = (v_item->>'batch_number');

            IF v_current_stock IS NULL OR v_current_stock < v_qty_needed THEN
                RAISE EXCEPTION 'Insufficient stock for Batch % after modification.', (v_item->>'batch_number');
            END IF;
        END IF;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date, transaction_type, stock_flow,
            total_units, quantity, quantity_mode, pack_size_quantity, 
            mrp, rate_per_unit, total_amount, item_discount, sale_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INTEGER, (v_item->>'batch_number'), (v_item->>'expiry_date')::DATE,
            v_trx_type, v_stock_flow, v_qty_needed, v_user_qty, (v_item->>'quantity_mode'), 
            COALESCE((v_item->>'pack_size_quantity')::INT, 1), 
            COALESCE((v_item->>'mrp_per_pack')::NUMERIC, (v_item->>'mrp')::NUMERIC, 0),
            (v_item->>'unit_price')::NUMERIC, (v_item->>'total_price')::NUMERIC,
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0), p_sale_id
        );
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
