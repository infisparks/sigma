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
    // Add other fields as they become relevant from Supabase
    clinical_notes?: string;
    follow_up_duration?: string;
    follow_up_note?: string;
    referring_doctor_name?: string;
    rx_list_json?: any[];
    symptoms_list_json?: any[];
    instructions_list_json?: string[];
    investigations_list_json?: string[];
    procedures_list_json?: string[];
    diagnosis_list_json?: any[];
    clinical_data?: any;
}

export interface PrescriptionTabProps {
    opdId: number;
    patient?: Patient; // Optional because some tabs might not need it immediately or it might be passed down
}
