-- RPC Function to Delete a Pharmacy Sale and Restore Stock
-- Logic:
-- 1. Identify all items sold in this sale.
-- 2. Loop through each item to RESTORE the stock (remaining_units) to the specific batch.
-- 3. Recalculate 'quantity' (packs) based on restored units.
-- 4. Delete the sale items.
-- 5. Delete the sale header.

CREATE OR REPLACE FUNCTION delete_pharmacy_sale(
    p_sale_id BIGINT
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
BEGIN
    -- 1. Restore Stock for Each Item
    FOR v_item IN 
        SELECT medicine_id, batch_number, total_units_sold, pack_size_quantity
        FROM pharmacy_sale_items 
        WHERE sale_id = p_sale_id
    LOOP
        -- Check if batch exists (it should, unless purged)
        IF EXISTS (SELECT 1 FROM pharmacy_batch_stock WHERE medicine_id = v_item.medicine_id AND batch_number = v_item.batch_number) THEN
            UPDATE pharmacy_batch_stock
            SET 
                remaining_units = remaining_units + v_item.total_units_sold,
                -- Recalculate packs: total units / units per pack
                quantity = FLOOR((remaining_units + v_item.total_units_sold) / GREATEST(pack_size_quantity, 1)),
                updated_at = NOW()
            WHERE medicine_id = v_item.medicine_id 
              AND batch_number = v_item.batch_number;
        END IF;
    END LOOP;

    -- 2. Delete Items
    DELETE FROM pharmacy_sale_items WHERE sale_id = p_sale_id;

    -- 3. Delete Header
    DELETE FROM pharmacy_sales WHERE id = p_sale_id;

    RETURN json_build_object('sale_id', p_sale_id, 'status', 'deleted');
END;
$$;

NOTIFY pgrst, 'reload schema';
