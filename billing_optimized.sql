-- Postgres Function for optimized billing dashboard - FIXED
-- This version uses a temporary table to ensure the filtered results are available for multiple calculations.

CREATE OR REPLACE FUNCTION get_billing_dashboard_data(
    p_start_date TEXT,
    p_end_date TEXT,
    p_hospital_name TEXT DEFAULT 'all',
    p_search_query TEXT DEFAULT '',
    p_service_type TEXT DEFAULT 'all',
    p_page_limit INTEGER DEFAULT 50,
    p_page_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_count INTEGER;
    v_summary JSONB;
    v_results JSONB;
    v_start_ts TIMESTAMPTZ;
    v_end_ts TIMESTAMPTZ;
BEGIN
    v_start_ts := p_start_date::TIMESTAMPTZ;
    v_end_ts := p_end_date::TIMESTAMPTZ;

    -- Use a temporary table to store filtered results for the session
    -- We drop it at the start to ensure a clean state
    DROP TABLE IF EXISTS billing_temp_results;
    
    CREATE TEMP TABLE billing_temp_results AS
    SELECT 
        r.*,
        p.name as patient_name,
        p.number as patient_number,
        p.uhid as patient_uhid
    FROM zregistration r
    LEFT JOIN patient_detail p ON r."UHID" = p.uhid
    WHERE r.created_at >= v_start_ts AND r.created_at <= v_end_ts
      AND (p_hospital_name = 'all' OR r.hospital_name = p_hospital_name)
      AND (
        p_search_query = '' OR 
        p.name ILIKE '%' || p_search_query || '%' OR 
        p.uhid ILIKE '%' || p_search_query || '%' OR 
        p.number::TEXT ILIKE '%' || p_search_query || '%'
      )
      AND (
        p_service_type = 'all' OR
        EXISTS (
            SELECT 1 FROM jsonb_array_elements(r.bloodtest_data) AS t
            WHERE t->>'serviceType' = p_service_type
        )
      );

    -- 1. Calculate Summary Totals
    SELECT jsonb_build_object(
        'totalAmount', COALESCE(SUM(
            CASE WHEN p_service_type = 'all' 
            THEN COALESCE((amount_paid_history->>'totalAmount')::NUMERIC, 0)
            ELSE (
                SELECT COALESCE(SUM((t->>'price')::NUMERIC), 0)
                FROM jsonb_array_elements(bloodtest_data) AS t
                WHERE t->>'serviceType' = p_service_type
            )
            END
        ), 0),
        'totalDiscount', COALESCE(SUM(COALESCE((amount_paid_history->>'discount')::NUMERIC, 0)), 0),
        'totalCash', COALESCE(SUM((
            SELECT COALESCE(SUM((h->>'amount')::NUMERIC), 0)
            FROM jsonb_array_elements(amount_paid_history->'paymentHistory') AS h
            WHERE h->>'paymentMode' = 'cash'
        )), 0),
        'totalOnline', COALESCE(SUM((
            SELECT COALESCE(SUM((h->>'amount')::NUMERIC), 0)
            FROM jsonb_array_elements(amount_paid_history->'paymentHistory') AS h
            WHERE h->>'paymentMode' = 'online'
        )), 0)
    ) INTO v_summary 
    FROM billing_temp_results;

    -- 2. Count Total Records
    SELECT COUNT(*) INTO v_total_count FROM billing_temp_results;

    -- 3. Get Paginated Registrations
    SELECT jsonb_agg(sub) INTO v_results FROM (
        SELECT * FROM billing_temp_results
        ORDER BY created_at DESC
        LIMIT p_page_limit
        OFFSET p_page_offset
    ) sub;

    -- Clean up
    DROP TABLE billing_temp_results;

    RETURN jsonb_build_object(
        'summary', v_summary,
        'totalRecords', v_total_count,
        'registrations', COALESCE(v_results, '[]'::jsonb)
    );
END;
$$;
