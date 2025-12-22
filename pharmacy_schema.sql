-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Vendors Table
CREATE TABLE IF NOT EXISTS public.pharmacy_vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Pharmacy Inventory (The active list of medicines in the pharmacy)
-- User wants to separate this from the master public.medicine table
CREATE TABLE IF NOT EXISTS public.pharmacy_inventory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    medicine_id BIGINT REFERENCES public.medicine(id), -- Nullable if it's a manual entry not in master
    
    -- Local copies/overrides of medicine details
    name TEXT NOT NULL,
    manufacturer_name TEXT,
    pack_size_label TEXT,
    description TEXT,
    
    -- Stock and Pricing
    current_stock INTEGER DEFAULT 0 NOT NULL,
    low_stock_limit INTEGER DEFAULT 3 NOT NULL,
    mrp DOUBLE PRECISION DEFAULT 0, -- Max Retail Price
    cost_price DOUBLE PRECISION DEFAULT 0, -- Vendor Price (Buying Price)
    
    -- Bulk assignment references
    preferred_vendor_id UUID REFERENCES public.pharmacy_vendors(id),
    
    -- Metadata
    batch_number TEXT,
    expiry_date DATE,
    location_rack TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for searching inventory
CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_name ON public.pharmacy_inventory(name);

-- 3. Pharmacy Purchases (Stock In / PO)
CREATE TABLE IF NOT EXISTS public.pharmacy_purchases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID REFERENCES public.pharmacy_vendors(id),
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    invoice_number TEXT,
    total_amount DOUBLE PRECISION,
    status TEXT CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Pharmacy Purchase Items (Line items for purchases)
CREATE TABLE IF NOT EXISTS public.pharmacy_purchase_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    purchase_id UUID REFERENCES public.pharmacy_purchases(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES public.pharmacy_inventory(id),
    
    batch_number TEXT,
    expiry_date DATE,
    quantity INTEGER NOT NULL,
    unit_cost_price DOUBLE PRECISION NOT NULL, -- Price at this specific purchase
    mrp DOUBLE PRECISION,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Pharmacy Sales (Billing)
CREATE TABLE IF NOT EXISTS public.pharmacy_sales (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_name TEXT, -- Can be linked to a users table if exists, but flexible for walk-ins
    customer_phone TEXT,
    patient_id UUID, -- Optional link to registered patient/user
    doctor_name TEXT,
    
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    subtotal DOUBLE PRECISION NOT NULL,
    discount_amount DOUBLE PRECISION DEFAULT 0,
    curr_total DOUBLE PRECISION NOT NULL, -- Final amount after discount
    
    payment_method TEXT DEFAULT 'cash', -- card, upi, etc.
    status TEXT DEFAULT 'completed',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Pharmacy Sale Items
CREATE TABLE IF NOT EXISTS public.pharmacy_sale_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_id UUID REFERENCES public.pharmacy_sales(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES public.pharmacy_inventory(id),
    
    quantity INTEGER NOT NULL,
    unit_price DOUBLE PRECISION NOT NULL, -- Price sold at
    total_price DOUBLE PRECISION NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to update inventory timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pharmacy_inventory_modtime
    BEFORE UPDATE ON public.pharmacy_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to handle auto-stock reduction on sale (Optional, can be done in app API)
-- For now, we will handle stock updates via application logic or a separate RPC function.
