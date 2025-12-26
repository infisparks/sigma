-- 1. Update Sales Tables for Splits and Units

-- Update Sales Header for Payment Splits
ALTER TABLE public.pharmacy_sales
ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'Cash', -- 'Cash', 'Online', 'Split'
ADD COLUMN IF NOT EXISTS paid_amount_cash numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_amount_online numeric DEFAULT 0;

-- Update Sales Items for Unit Tracking
ALTER TABLE public.pharmacy_sale_items
ADD COLUMN IF NOT EXISTS batch_number text,
ADD COLUMN IF NOT EXISTS expiry_date date,
ADD COLUMN IF NOT EXISTS pack_size_quantity integer DEFAULT 1, -- Snapshot of pack size
ADD COLUMN IF NOT EXISTS quantity_mode text DEFAULT 'Pack', -- 'Pack' or 'Unit' (Loose)
ADD COLUMN IF NOT EXISTS total_units_sold integer DEFAULT 0; -- The actual atomic deduction

-- 2. Create RPC for Atomic Sales Transaction
CREATE OR REPLACE FUNCTION save_sales_entry(
    p_customer_name text,
    p_customer_phone text,
    p_patient_id text, -- UHID or NULL
    p_doctor_name text,
    p_payment_mode text, -- 'Cash', 'Online', 'Split'
    p_paid_cash numeric,
    p_paid_online numeric,
    p_subtotal numeric,
    p_discount_amount numeric,
    p_final_total numeric,
    p_items jsonb -- Array of items
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id bigint;
    v_item jsonb;
    v_current_stock_units integer;
    v_new_stock_units integer;
BEGIN
    -- 1. Insert Sales Header
    INSERT INTO pharmacy_sales (
        customer_name,
        customer_phone,
        patient_id,
        doctor_name,
        payment_mode,
        paid_amount_cash,
        paid_amount_online,
        subtotal,
        discount_amount,
        curr_total,
        status,
        created_at
    ) VALUES (
        p_customer_name,
        p_customer_phone,
        p_patient_id,
        p_doctor_name,
        p_payment_mode,
        p_paid_cash,
        p_paid_online,
        p_subtotal,
        p_discount_amount,
        p_final_total,
        'completed',
        now()
    ) RETURNING id INTO v_sale_id;

    -- 2. Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Check Stock (Optional safety, though frontend should prevent)
        SELECT remaining_units INTO v_current_stock_units
        FROM pharmacy_batch_stock
        WHERE medicine_id = (v_item->>'medicine_id')::bigint 
          AND batch_number = (v_item->>'batch_number');

        IF v_current_stock_units IS NULL THEN
            RAISE EXCEPTION 'Batch % not found for Medicine ID %', (v_item->>'batch_number'), (v_item->>'medicine_id');
        END IF;

        IF v_current_stock_units < (v_item->>'total_units_sold')::integer THEN
             RAISE EXCEPTION 'Insufficient stock for Batch %. Available: %, Requested: %', (v_item->>'batch_number'), v_current_stock_units, (v_item->>'total_units_sold');
        END IF;

        -- Deduct Stock (Units)
        v_new_stock_units := v_current_stock_units - (v_item->>'total_units_sold')::integer;

        -- Update Batch Stock
        -- We update quantity (packs) roughly as integer division for display, but remaining_units is key
        UPDATE pharmacy_batch_stock
        SET remaining_units = v_new_stock_units,
            quantity = FLOOR(v_new_stock_units / GREATEST(pack_size_quantity, 1)) -- Approx packs
        WHERE medicine_id = (v_item->>'medicine_id')::bigint 
          AND batch_number = (v_item->>'batch_number');

        -- Insert Sale Item
        INSERT INTO pharmacy_sale_items (
            sale_id,
            inventory_id, -- We might map this to medicine_id or link to batch, using medicine_id for now if inventory_id is deprecated or use batch logic
            quantity, -- Qty entered by user (e.g. 5)
            unit_price, -- Price per Qty (e.g. Price per Strip or Price per Tablet)
            total_price,
            batch_number,
            expiry_date,
            pack_size_quantity,
            quantity_mode, -- 'Pack' or 'Unit'
            total_units_sold
        ) VALUES (
            v_sale_id,
            (v_item->>'medicine_id')::bigint, -- Assuming inventory_id maps to medicine table id in this legacy schema
            (v_item->>'quantity')::numeric,
            (v_item->>'unit_price')::numeric,
            (v_item->>'total_price')::numeric,
            (v_item->>'batch_number'),
            (v_item->>'expiry_date')::date,
            (v_item->>'pack_size_quantity')::integer,
            (v_item->>'quantity_mode'),
            (v_item->>'total_units_sold')::integer
        );
    END LOOP;

    RETURN json_build_object('sale_id', v_sale_id);
END;
$$;
