-- 1. Batch Inventory (Tracks stock at granular level)
CREATE TABLE IF NOT EXISTS public.pharmacy_batch_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    medicine_id INT REFERENCES public.clinic_medicine(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    quantity INT NOT NULL DEFAULT 0, -- Current stock level
    mrp DECIMAL(10, 2) NOT NULL,
    purchase_rate DECIMAL(10, 2) NOT NULL, -- Cost Price per unit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique constraint for upserting logic
    CONSTRAINT uq_med_batch UNIQUE (medicine_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batch_med_id ON public.pharmacy_batch_stock(medicine_id);
CREATE INDEX IF NOT EXISTS idx_batch_expiry ON public.pharmacy_batch_stock(expiry_date);


-- 2. Purchase Invoice Header
CREATE TABLE IF NOT EXISTS public.pharmacy_purchase_invoice (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_id UUID REFERENCES public.pharmacy_vendors(id),
    invoice_number TEXT,
    invoice_date DATE DEFAULT CURRENT_DATE,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'completed', -- 'draft', 'completed'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Purchase Invoice Items (Line Items)
CREATE TABLE IF NOT EXISTS public.pharmacy_purchase_item (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_id UUID REFERENCES public.pharmacy_purchase_invoice(id) ON DELETE CASCADE,
    medicine_id INT REFERENCES public.clinic_medicine(id),
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    quantity INT NOT NULL, -- Quantity purchased
    free_quantity INT DEFAULT 0, -- Scheme/Free items
    pack_size TEXT, -- Snapshot of pack size
    mrp DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL, -- Purchase Rate per unit
    tax_percent DECIMAL(5, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL, -- (qt * rate) + tax
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_item_purchase_id ON public.pharmacy_purchase_item(purchase_id);
