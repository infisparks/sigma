create table public.clinic_medicine (
  id serial not null,
  name text not null,
  pack_size_label text null,
  hsn_code text null default '3004'::text,
  vendor_id uuid null,
  original_medicine_id bigint null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  pack_size_quantity integer null default 1,
  constraint clinic_medicine_pkey primary key (id),
  constraint clinic_medicine_vendor_id_fkey foreign KEY (vendor_id) references pharmacy_vendors (id),
  constraint clinic_medicine_original_medicine_id_fkey foreign KEY (original_medicine_id) references medicine (id)
) TABLESPACE pg_default;

create index IF not exists idx_clinic_medicine_name on public.clinic_medicine using btree (name) TABLESPACE pg_default;
