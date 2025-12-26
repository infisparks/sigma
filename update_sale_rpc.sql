-- RPC Function to Handle Pharmacy Bill Updates (Edit Mode)
-- Logic: 
-- 1. Revert stock for all PREVIOUS items in this sale (add back to inventory).
-- 2. Delete previous items.
-- 3. Update Sales Header with new totals/customer info.
-- 4. Process NEW items list (deduct stock and insert items).
-- This ensures total inventory accuracy without complex diffing.

CREATE OR REPLACE FUNCTION update_pharmacy_sale(
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
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_item RECORD;
    v_item jsonb;
    v_current_stock_units integer;
    v_new_stock_units integer;
BEGIN
    -- 1. Revert Stock for Existing Items
    FOR v_old_item IN 
        SELECT medicine_id, batch_number, total_units_sold 
        FROM pharmacy_sale_items 
        WHERE sale_id = p_sale_id
    LOOP
        UPDATE pharmacy_batch_stock
        SET remaining_units = remaining_units + v_old_item.total_units_sold,
            quantity = FLOOR((remaining_units + v_old_item.total_units_sold) / GREATEST(pack_size_quantity, 1))
        WHERE medicine_id = v_old_item.medicine_id 
          AND batch_number = v_old_item.batch_number;
    END LOOP;

    -- 2. Delete Old Items
    DELETE FROM pharmacy_sale_items WHERE sale_id = p_sale_id;

    -- 3. Update Sale Header
    UPDATE pharmacy_sales
    SET customer_name = p_customer_name,
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
        created_at = now() -- Optional: Update timestamp or keep original? Usually keep original or have updated_at
    WHERE id = p_sale_id;

    -- 4. Process New Items (Same logic as Save)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Check Stock
        SELECT remaining_units INTO v_current_stock_units
        FROM pharmacy_batch_stock
        WHERE medicine_id = (v_item->>'medicine_id')::bigint 
          AND batch_number = (v_item->>'batch_number');

        IF v_current_stock_units IS NULL THEN
            RAISE EXCEPTION 'Batch % not found for Medicine ID %', (v_item->>'batch_number'), (v_item->>'medicine_id');
        END IF;

        IF v_current_stock_units < (v_item->>'total_units_sold')::integer THEN
             RAISE EXCEPTION 'Insufficient stock for Batch %. Available: %', (v_item->>'batch_number'), v_current_stock_units;
        END IF;

        -- Deduct Stock
        v_new_stock_units := v_current_stock_units - (v_item->>'total_units_sold')::integer;

        UPDATE pharmacy_batch_stock
        SET remaining_units = v_new_stock_units,
            quantity = FLOOR(v_new_stock_units / GREATEST(pack_size_quantity, 1))
        WHERE medicine_id = (v_item->>'medicine_id')::bigint 
          AND batch_number = (v_item->>'batch_number');

        -- Insert Item
        INSERT INTO pharmacy_sale_items (
            sale_id, medicine_id, quantity, unit_price, total_price,
            batch_number, expiry_date, pack_size_quantity, quantity_mode, total_units_sold, discount_amount
        ) VALUES (
            p_sale_id, -- Link to existing ID
            (v_item->>'medicine_id')::bigint,
            (v_item->>'quantity')::numeric,
            (v_item->>'unit_price')::numeric,
            (v_item->>'total_price')::numeric,
            (v_item->>'batch_number'),
            (v_item->>'expiry_date')::date,
            (v_item->>'pack_size_quantity')::integer,
            (v_item->>'quantity_mode'),
            (v_item->>'total_units_sold')::integer,
            COALESCE((v_item->>'discount_amount')::numeric, 0)
        );
    END LOOP;

    RETURN json_build_object('sale_id', p_sale_id, 'status', 'success');
END;
$$;

NOTIFY pgrst, 'reload schema';
