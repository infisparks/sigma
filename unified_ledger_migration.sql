-- ==============================================================================
-- MIGRATION: Unified Ledger System (pharmacy_stock_ledger)
-- ==============================================================================

-- 1. CLEANUP: Robustly Drop Old Tables/Views
DO $$ 
BEGIN
    -- Handle pharmacy_sale_items (could be table or view)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'pharmacy_sale_items' AND n.nspname = 'public' AND c.relkind = 'r') THEN
        DROP TABLE public.pharmacy_sale_items CASCADE;
    ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'pharmacy_sale_items' AND n.nspname = 'public' AND c.relkind = 'v') THEN
        DROP VIEW public.pharmacy_sale_items CASCADE;
    END IF;

    -- Handle pharmacy_batch_stock (could be table or view)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'pharmacy_batch_stock' AND n.nspname = 'public' AND c.relkind = 'r') THEN
        DROP TABLE public.pharmacy_batch_stock CASCADE;
    ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'pharmacy_batch_stock' AND n.nspname = 'public' AND c.relkind = 'v') THEN
        DROP VIEW public.pharmacy_batch_stock CASCADE;
    END IF;

    -- Handle pharmacy_purchase_item (usually a table)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'pharmacy_purchase_item' AND n.nspname = 'public' AND c.relkind = 'r') THEN
        DROP TABLE public.pharmacy_purchase_item CASCADE;
    END IF;
END $$;

-- 2. CREATE: Unified Ledger Table
CREATE TABLE public.pharmacy_stock_ledger (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    medicine_id INTEGER NOT NULL REFERENCES public.clinic_medicine(id),
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    transaction_type TEXT NOT NULL, -- 'VENDOR_PURCHASE', 'ITEM_SELL', 'RETURN', 'ADJUSTMENT'
    
    -- Quantity Handling
    quantity_packs INTEGER NOT NULL DEFAULT 0,  -- Absolute number of packs
    quantity_units INTEGER NOT NULL DEFAULT 0,  -- Absolute number of loose units
    pack_size_quantity INTEGER NOT NULL DEFAULT 1, -- Snapshot of pack size
    stock_flow INTEGER NOT NULL DEFAULT 0,      -- 1 for Incoming (Add), -1 for Outgoing (Deduct)
    
    -- Pricing
    mrp NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rate_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0, -- Cost Price (Purchase) or Selling Price (Sale)
    tax_percent NUMERIC(5, 2) DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    
    -- References
    purchase_invoice_id UUID REFERENCES public.pharmacy_purchase_invoice(id) ON DELETE CASCADE,
    sale_invoice_id BIGINT REFERENCES public.pharmacy_sales(id) ON DELETE CASCADE, -- REVERTED TO BIGINT
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT pharmacy_stock_ledger_pkey PRIMARY KEY (id)
);

-- 3. INDEXES
CREATE INDEX idx_ledger_med_batch ON public.pharmacy_stock_ledger(medicine_id, batch_number);
CREATE INDEX idx_ledger_expiry ON public.pharmacy_stock_ledger(expiry_date);
CREATE INDEX idx_ledger_type ON public.pharmacy_stock_ledger(transaction_type);
CREATE INDEX idx_ledger_created ON public.pharmacy_stock_ledger(created_at);

-- 4. VIEW: Backward Compatibility for Stock
CREATE OR REPLACE VIEW public.pharmacy_batch_stock AS
SELECT 
    min(id::text)::uuid as id, -- Dummy ID
    medicine_id,
    batch_number,
    min(expiry_date) as expiry_date,
    SUM(quantity_packs * stock_flow) as quantity,
    SUM(quantity_units * stock_flow) as remaining_units,
    MAX(pack_size_quantity) as pack_size_quantity,
    MAX(mrp) as mrp,
    MAX(case when transaction_type = 'VENDOR_PURCHASE' then rate_per_unit else 0 end) as purchase_rate
FROM public.pharmacy_stock_ledger
GROUP BY medicine_id, batch_number
HAVING SUM(quantity_units * stock_flow) > 0;

-- 5. FUNCTION: Purchase Entry
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
    v_total_qty INT;
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
        v_total_qty := v_billed_qty + v_free_qty;
        v_total_units := v_total_qty * v_pack_qty;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type,
            quantity_packs, quantity_units, pack_size_quantity, stock_flow,
            mrp, rate_per_unit, total_amount,
            purchase_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INT, v_item->>'batch_number', (v_item->>'expiry_date')::DATE,
            'VENDOR_PURCHASE',
            v_total_qty, v_total_units, v_pack_qty, 1,
            (v_item->>'mrp')::DECIMAL, (v_item->>'unit_price')::DECIMAL, (v_item->>'total_amount')::DECIMAL,
            v_purchase_id
        );
        
        UPDATE public.clinic_medicine
        SET pack_size_quantity = v_pack_qty, updated_at = NOW()
        WHERE id = (v_item->>'medicine_id')::INT AND pack_size_quantity != v_pack_qty;
    END LOOP;

    RETURN v_purchase_id;
END;
$$;

-- 6. FUNCTION: Sales Entry
CREATE OR REPLACE FUNCTION save_sales_entry(
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
    p_items jsonb
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id BIGINT; -- REVERTED TO BIGINT
    v_item jsonb;
    v_qty_needed integer;
    v_current_stock integer;
    v_pack_qty integer;
BEGIN
    INSERT INTO pharmacy_sales (
        customer_name, customer_phone, patient_id, doctor_name, payment_mode,
        paid_amount_cash, paid_amount_online, subtotal, discount_amount, curr_total, status, created_at
    ) VALUES (
        p_customer_name, p_customer_phone, p_patient_id, p_doctor_name, p_payment_mode,
        p_paid_cash, p_paid_online, p_subtotal, p_discount_amount, p_final_total, 'completed', now()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty_needed := (v_item->>'total_units_sold')::INTEGER;
        v_pack_qty := (v_item->>'pack_size_quantity')::INTEGER;

        SELECT remaining_units INTO v_current_stock
        FROM pharmacy_batch_stock
        WHERE medicine_id = (v_item->>'medicine_id')::INTEGER
          AND batch_number = (v_item->>'batch_number');

        IF v_current_stock IS NULL OR v_current_stock < v_qty_needed THEN
             RAISE EXCEPTION 'Insufficient stock for Batch %. Available: %, Requested: %', 
                (v_item->>'batch_number'), COALESCE(v_current_stock, 0), v_qty_needed;
        END IF;

        INSERT INTO public.pharmacy_stock_ledger (
            medicine_id, batch_number, expiry_date,
            transaction_type,
            quantity_packs, quantity_units, pack_size_quantity, stock_flow,
            mrp, rate_per_unit, total_amount,
            sale_invoice_id
        ) VALUES (
            (v_item->>'medicine_id')::INTEGER, (v_item->>'batch_number'), (v_item->>'expiry_date')::DATE,
            'ITEM_SELL',
            0, v_qty_needed, v_pack_qty, -1,
             0, (v_item->>'unit_price')::NUMERIC, (v_item->>'total_price')::NUMERIC,
            v_sale_id
        );
        
    END LOOP;

    RETURN json_build_object('sale_id', v_sale_id);
END;
$$;

-- 7. VIEW: Sales Items
CREATE OR REPLACE VIEW public.pharmacy_sale_items AS
SELECT
    id,
    sale_invoice_id as sale_id, 
    medicine_id,
    batch_number,
    expiry_date,
    quantity_units as quantity,
    'Unit' as quantity_mode,
    pack_size_quantity,
    quantity_units as total_units_sold,
    rate_per_unit as unit_price,
    total_amount as total_price,
    created_at,
    0::numeric as discount_amount
FROM public.pharmacy_stock_ledger
WHERE transaction_type = 'ITEM_SELL';
