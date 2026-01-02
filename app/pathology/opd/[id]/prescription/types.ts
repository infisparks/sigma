export interface Patient {
    name: string;
    age: number;
    age_unit: string;
    gender: string;
    uhid: string;
}

export interface OPDRecord {
    id: number;
    patient_detail: Patient;
    is_finalized?: boolean;
    clinical_notes?: string;
    follow_up_duration?: string;
    follow_up_note?: string;
    referring_doctor_name?: string;
    rx_list_json?: PrescriptionEntry[];
    symptoms_list_json?: SymptomDetail[];
    instructions_list_json?: string[];
    investigations_list_json?: string[];
    procedures_list_json?: string[];
    diagnosis_list_json?: DiagnosisDetail[];
    clinical_data?: any;
}

export interface PrescriptionTabProps {
    opdId: number;
    patient?: Patient;
}

// --- Shared Models ---

export interface CustomOptionGroup {
    title: string;
    options: string[];
}

// Symptoms
export interface SymptomDetail {
    name: string;
    note: string;
    duration?: string;
    severity?: string;
    customGroups: CustomOptionGroup[];
    selectedCustomOptions: string[]; // Changed from Set<string> to string[] for JSON serializability
}

// Diagnosis
export interface DiagnosisDetail {
    name: string;
    note: string;
    location?: string;
    status?: string;
    customGroups: CustomOptionGroup[];
    selectedCustomOptions: string[]; // Changed from Set<string> to string[] for JSON serializability
}

// Treatment / Rx
export interface TimingSchedule {
    bb: boolean; ab: boolean;
    bl: boolean; al: boolean;
    bd: boolean; ad: boolean;
}

export interface PrescriptionEntry {
    id: string;
    name: string;
    type: string;
    dosage: string;
    duration: string;
    note: string;
    timing: TimingSchedule;
}
