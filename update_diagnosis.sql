-- Add diagnosis_list_json column to opd_registration
ALTER TABLE public.opd_registration
ADD COLUMN IF NOT EXISTS diagnosis_list_json jsonb DEFAULT '[]'::jsonb;

-- Create index for diagnosis_list_json
CREATE INDEX IF NOT EXISTS idx_opd_diagnosis_json ON public.opd_registration USING gin (diagnosis_list_json);

-- Ensure opd_datasets table exists (if not already)
CREATE TABLE IF NOT EXISTS public.opd_datasets (
    id serial PRIMARY KEY,
    dataname text NOT NULL UNIQUE,
    datajson jsonb DEFAULT '[]'::jsonb
);

-- Insert or Update Diagnosis master data
INSERT INTO public.opd_datasets (dataname, datajson)
VALUES (
    'Diagnosis',
    '[
        "Diabetes mellitus type 2",
        "Hypertension",
        "IHD - Ischemic heart disease",
        "Hypothyroid",
        "Migraine",
        "URTI Upper Respiratory Tract Infection",
        "GAD - Generalized anxiety disorder",
        "CHB - Complete heart block",
        "PN - Peripheral neuropathy",
        "Asthma",
        "COPD",
        "Gastroenteritis",
        "Anemia",
        "Osteoarthritis",
        "Rheumatoid Arthritis",
        "PCOS",
        "Dengue Fever",
        "Typhoid",
        "Malaria",
        "Viral Fever",
        "Tuberculosis",
        "Pneumonia",
        "UTI - Urinary Tract Infection",
        "CKD - Chronic Kidney Disease",
        "Liver Cirrhosis",
        "Epilepsy",
        "Stroke",
        "Parkinsons Disease",
        "Alzheimers Disease",
        "Depression",
        "Schizophrenia",
        "Bipolar Disorder",
        "Cataract",
        "Glaucoma",
        "Conjunctivitis",
        "Otitis Media",
        "Sinusitis",
        "Tonsillitis",
        "Appendicitis",
        "Hernia",
        "Hemorrhoids",
        "Fissure",
        "Fistula",
        "Cholelithiasis",
        "Renal Calculi",
        "Prostate Enlargement",
        "Eczema",
        "Psoriasis",
        "Acne",
        "Scabies",
        "Fungal Infection"
    ]'::jsonb
)
ON CONFLICT (dataname) 
DO UPDATE SET datajson = EXCLUDED.datajson;
