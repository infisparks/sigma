-- Add new columns to opd_registration to store data from new tabs
ALTER TABLE public.opd_registration
ADD COLUMN IF NOT EXISTS medical_history_json jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS fitness_plan_json jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS checkup_data_json jsonb DEFAULT '{}'::jsonb;

-- Comment:
-- medical_history_json: Stores { problems, allergies, familyHistory, lifestyle } from MedicalHistoryTab
-- fitness_plan_json: Stores array of FitnessPlan from FitnessTab
-- checkup_data_json: Stores key-value pairs of checkup responses from CheckupTab
