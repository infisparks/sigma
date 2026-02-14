-- ==============================================================================
-- UNIFIED PHARMACY LEDGER: Master Fixer Script
-- ==============================================================================

-- 1. CLEANUP: Force remove old views that cause errors
DO $$ 
BEGIN
    DROP VIEW IF EXISTS public.pharmacy_sale_items CASCADE;
    DROP VIEW IF EXISTS public.pharmacy_batch_stock CASCADE;
    
    -- Drop functions to avoid return type mismatch errors
    DROP FUNCTION IF EXISTS public.get_current_stock(INTEGER);
    DROP FUNCTION IF EXISTS public.save_purchase_entry(UUID, TEXT, DATE, DECIMAL, JSONB);
    DROP FUNCTION IF EXISTS public.save_sales_entry(text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text);
    DROP FUNCTION IF EXISTS public.delete_pharmacy_sale(BIGINT);
    DROP FUNCTION IF EXISTS public.update_pharmacy_sale(BIGINT, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text);
END $$;

-- 2. ENSURE LEDGER SCHEMA (pharmacy_stock_ledger)
-- This table is the single source of truth for all stock transactions.
CREATE TABLE IF NOT EXISTS public.pharmacy_stock_ledger (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    medicine_id INTEGER NOT NULL REFERENCES public.clinic_medicine(id),
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    
    transaction_type TEXT NOT NULL, -- 'PURCHASE', 'SALE', 'VENDOR_RET', 'USER_RET', 'EXPIRED'
    stock_flow INTEGER NOT NULL DEFAULT 0, -- +1 for Inward, -1 for Outward
    
    quantity_billed INTEGER NOT NULL DEFAULT 0, -- Packs Billed
    quantity_free INTEGER NOT NULL DEFAULT 0,   -- Packs Free
    total_units INTEGER NOT NULL DEFAULT 0,     -- (Billed + Free) * Pack Size
    pack_size_quantity INTEGER NOT NULL DEFAULT 1, 
    
    quantity_mode TEXT DEFAULT 'Pack', -- 'Pack' or 'Loose'
    
    mrp NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rate_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0, 
    tax_percent NUMERIC(5, 2) DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    item_discount NUMERIC(10, 2) DEFAULT 0,
    
    purchase_invoice_id UUID REFERENCES public.pharmacy_purchase_invoice(id) ON DELETE CASCADE,
    sale_invoice_id BIGINT REFERENCES public.pharmacy_sales(id) ON DELETE CASCADE,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT pharmacy_stock_ledger_pkey PRIMARY KEY (id)
);

-- 3. RPC: get_current_stock()
-- Dynamic stock calculation directly from ledger records.
CREATE OR REPLACE FUNCTION get_current_stock(p_medicine_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    medicine_id INTEGER,
    batch_number TEXT,
    expiry_date DATE,
    quantity BIGINT,
    remaining_units BIGINT,
    pack_size_quantity INTEGER,
    mrp NUMERIC,
    purchase_rate NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.medicine_id,
        l.batch_number,
        min(l.expiry_date) as expiry_date,
        SUM((l.quantity_billed + l.quantity_free) * l.stock_flow)::BIGINT as quantity,
        SUM(l.total_units * l.stock_flow)::BIGINT as remaining_units,
        MAX(l.pack_size_quantity) as pack_size_quantity,
        MAX(l.mrp) as mrp,
        MAX(case when l.transaction_type = 'PURCHASE' then l.rate_per_unit else 0 end) as purchase_rate
    FROM public.pharmacy_stock_ledger l
    WHERE (p_medicine_id IS NULL OR l.medicine_id = p_medicine_id)
    GROUP BY l.medicine_id, l.batch_number
    HAVING SUM(l.total_units * l.stock_flow) > 0;
END;
$$;

-- 4. RPC: save_purchase_entry()
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
    INSERT INTO public.pharmacy_purchase_invoice (
        vendor_id, invoice_number, invoice_date, total_amount, status
    ) VALUES (
        p_vendor_id, p_invoice_number, p_invoice_date, p_total_amount, 'completed'
    ) RETURNING id INTO v_purchase_id;

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

-- 5. RPC: save_sales_entry()
-- Replaces old version that used pharmacy_batch_stock view.
CREATE OR REPLACE FUNCTION public.save_sales_entry(
    p_customer_name text,
    p_customer_phone text,
    p_patient_id text, 
    p_doctor_name text,
    p_payment_mode text,
    p_paid_cash numeric,
    p_paid_online numeric,
    p_subtotal numeric,
    p_discount_amount numeric,
    p_final_total numeric,
    p_items jsonb,
    p_notes text DEFAULT ''
)
RETURNS JSON 
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id BIGINT;
    v_item JSONB;
    v_qty_needed INTEGER;
    v_current_stock INTEGER;
BEGIN
    -- 1. Create Sales Header
    INSERT INTO public.pharmacy_sales (
        customer_name, customer_phone, patient_id, doctor_name, payment_mode,
        paid_amount_cash, paid_amount_online, subtotal, discount_amount, curr_total, status, notes
    ) VALUES (
        p_customer_name, p_customer_phone, p_patient_id, p_doctor_name, p_payment_mode,
        p_paid_cash, p_paid_online, p_subtotal, p_discount_amount, p_final_total, 'completed', p_notes
    ) RETURNING id INTO v_sale_id;

    -- 2. Process Items in Ledger
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty_needed := (v_item->>'total_units_sold')::INTEGER;

        -- Check Availability from Ledger directly (Sum of flow)
        SELECT SUM(total_units * stock_flow) INTO v_current_stock
        FROM public.pharmacy_stock_ledger
        WHERE medicine_id = (v_item->>'medicine_id')::INTEGER
          AND batch_number = (v_item->>'batch_number');

        IF v_current_stock IS NULL OR v_current_stock < v_qty_needed THEN
             RAISE EXCEPTION 'Insufficient stock for Batch %. Available: %, Requested: %', 
                (v_item->>'batch_number'), COALESCE(v_current_stock, 0), v_qty_needed;
        END IF;

        -- Record Sale in Ledger (Negative Flow)
        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type, stock_flow,
            total_units, quantity_mode, pack_size_quantity,
            mrp, rate_per_unit, total_amount, item_discount,
            sale_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INTEGER, (v_item->>'batch_number'), (v_item->>'expiry_date')::DATE,
            'SALE', -1,
            v_qty_needed, (v_item->>'quantity_mode'), COALESCE((v_item->>'pack_size_quantity')::INT, 1),
            (v_item->>'mrp')::NUMERIC, (v_item->>'unit_price')::NUMERIC, (v_item->>'total_price')::NUMERIC,
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            v_sale_id
        );
    END LOOP;

    RETURN json_build_object('sale_id', v_sale_id, 'status', 'success');
END;
$$;

-- 5. RPC: delete_pharmacy_sale()
-- Restores stock by simply removing the ledger entry.
CREATE OR REPLACE FUNCTION public.delete_pharmacy_sale(p_sale_id BIGINT)
RETURNS VOID 
LANGUAGE plpgsql
AS $$
BEGIN
    -- Deleting ledger entries with -1 flow effectively restores the stock
    DELETE FROM public.pharmacy_stock_ledger WHERE sale_invoice_id = p_sale_id;
    
    -- Delete the sale record itself
    DELETE FROM public.pharmacy_sales WHERE id = p_sale_id;
END;
$$;

-- 6. RPC: update_pharmacy_sale()
-- Handles editing a sale by clearing old ledger entries and re-inserting new ones.
CREATE OR REPLACE FUNCTION public.update_pharmacy_sale(
    p_sale_id BIGINT,
    p_customer_name text,
    p_customer_phone text,
    p_patient_id text, 
    p_doctor_name text,
    p_payment_mode text,
    p_paid_cash numeric,
    p_paid_online numeric,
    p_subtotal numeric,
    p_discount_amount numeric,
    p_final_total numeric,
    p_items jsonb,
    p_notes text DEFAULT ''
)
RETURNS VOID 
LANGUAGE plpgsql
AS $$
DECLARE
    v_item JSONB;
    v_qty_needed INTEGER;
    v_current_stock INTEGER;
BEGIN
    -- 1. Update Header
    UPDATE public.pharmacy_sales SET
        customer_name = p_customer_name,
        customer_phone = p_customer_phone,
        patient_id = p_patient_id,
        doctor_name = p_doctor_name,
        payment_mode = p_payment_mode,
        paid_amount_cash = p_paid_cash,
        paid_amount_online = p_paid_online,
        subtotal = p_subtotal,
        discount_amount = p_discount_amount,
        curr_total = p_final_total,
        notes = p_notes,
        updated_at = now()
    WHERE id = p_sale_id;

    -- 2. Clear previous ledger entries for this sale (Restores stock temporarily)
    DELETE FROM public.pharmacy_stock_ledger WHERE sale_invoice_id = p_sale_id;

    -- 3. Re-insert new items & check stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty_needed := (v_item->>'total_units_sold')::INTEGER;

        -- Stock check
        SELECT SUM(total_units * stock_flow) INTO v_current_stock
        FROM public.pharmacy_stock_ledger
        WHERE medicine_id = (v_item->>'medicine_id')::INTEGER
          AND batch_number = (v_item->>'batch_number');

        IF v_current_stock IS NULL OR v_current_stock < v_qty_needed THEN
             RAISE EXCEPTION 'Insufficient stock for Batch % after modification. Available: %, Requested: %', 
                (v_item->>'batch_number'), COALESCE(v_current_stock, 0), v_qty_needed;
        END IF;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type, stock_flow,
            total_units, quantity_mode, pack_size_quantity,
            mrp, rate_per_unit, total_amount, item_discount,
            sale_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INTEGER, (v_item->>'batch_number'), (v_item->>'expiry_date')::DATE,
            'SALE', -1,
            v_qty_needed, (v_item->>'quantity_mode'), COALESCE((v_item->>'pack_size_quantity')::INT, 1),
            (v_item->>'mrp')::NUMERIC, (v_item->>'unit_price')::NUMERIC, (v_item->>'total_price')::NUMERIC,
            COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
            p_sale_id
        );
    END LOOP;
END;
$$;

-- 7. NOTIFY SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';
