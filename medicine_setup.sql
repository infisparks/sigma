-- Create the Global Medicine Table (Source of Truth)
CREATE TABLE IF NOT EXISTS public.medicine (
  id bigint not null,
  name text null,
  price double precision null,
  "Is_discontinued" boolean null,
  manufacturer_name text null,
  type text null,
  pack_size_label text null,
  short_composition1 text null,
  short_composition2 text null,
  salt_composition text null,
  medicine_desc text null,
  side_effects text null,
  drug_interactions text null,
  constraint medicine_pkey primary key (id),
  constraint medicine_id_key unique (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_medicine_name on public.medicine using btree (name) TABLESPACE pg_default;

-- Create the Clinic Medicine Table (Local Inventory/Formulary)
CREATE TABLE IF NOT EXISTS public.clinic_medicine (
  id SERIAL PRIMARY KEY, -- Sequence 1, 2, 3, 4...
  name TEXT NOT NULL,
  pack_size_label TEXT,
  hsn_code TEXT DEFAULT '3004',
  vendor_id UUID REFERENCES public.pharmacy_vendors(id),
  original_medicine_id BIGINT REFERENCES public.medicine(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast searching in clinic medicine
CREATE INDEX IF NOT EXISTS idx_clinic_medicine_name ON public.clinic_medicine(name);
