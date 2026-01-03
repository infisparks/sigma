"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from "@/lib/supabase";
import {
    SymptomDetail,
    DiagnosisDetail,
    PrescriptionEntry,
    TimingSchedule
} from '../types';

// --- State Shape ---
interface PrescriptionState {
    // Meta
    isLoading: boolean;
    isSaving: boolean;
    isFinalized: boolean; // From DB
    lastSavedAt: string | null;

    // Data - Clinical
    symptoms: Record<string, SymptomDetail>;
    diagnoses: Record<string, DiagnosisDetail>;
    medicines: PrescriptionEntry[];

    // Data - Instructions / Plans
    instructions: string[];
    investigations: string[];
    procedures: string[];

    // Data - Global
    clinicalNote: string;
    followUpDuration: string;
    followUpNote: string;
    referringDoctor: string;
    // AI Suggestions
    suggestedDiagnoses: string[];
    suggestedMedicines: string[];
    suggestedInvestigations?: string[];
    suggestedInstructions?: string[];
    suggestedProcedures?: string[];
}

// --- Actions ---
interface PrescriptionActions {
    // Symptoms
    addSymptom: (detail: SymptomDetail) => void;
    removeSymptom: (name: string) => void;
    updateSymptom: (name: string, updates: Partial<SymptomDetail>) => void;

    // Diagnoses
    addDiagnosis: (detail: DiagnosisDetail) => void;
    removeDiagnosis: (name: string) => void;
    updateDiagnosis: (name: string, updates: Partial<DiagnosisDetail>) => void;

    // Medicines
    addMedicine: (med: PrescriptionEntry) => void;
    removeMedicine: (id: string) => void;
    updateMedicine: (id: string, updates: Partial<PrescriptionEntry>) => void;
    setMedicines: (meds: PrescriptionEntry[]) => void; // For reordering or bulk

    // Instructions
    setInstructions: (list: string[]) => void;
    setInvestigations: (list: string[]) => void;
    setProcedures: (list: string[]) => void;

    // Global
    setClinicalNote: (note: string) => void;
    setFollowUp: (duration: string, note: string) => void;
    setReferringDoctor: (name: string) => void;

    // Core
    saveAndFinalize: () => Promise<void>;
    refreshData: () => Promise<void>;
}

const PrescriptionContext = createContext<(PrescriptionState & PrescriptionActions) | null>(null);

export function usePrescription() {
    const context = useContext(PrescriptionContext);
    if (!context) {
        throw new Error("usePrescription must be used within a PrescriptionProvider");
    }
    return context;
}

interface PrescriptionProviderProps {
    children: ReactNode;
    opdId: number;
}

export function PrescriptionProvider({ children, opdId }: PrescriptionProviderProps) {
    // --- State ---
    const [state, setState] = useState<PrescriptionState>({
        isLoading: true,
        isSaving: false,
        isFinalized: false,
        lastSavedAt: null,
        symptoms: {},
        diagnoses: {},
        medicines: [],
        instructions: [],
        investigations: [],
        procedures: [],
        clinicalNote: "",
        followUpDuration: "",
        followUpNote: "",
        referringDoctor: "",
        suggestedDiagnoses: [],
        suggestedMedicines: [],
        suggestedInvestigations: [],
        suggestedInstructions: [],
        suggestedProcedures: [],
    });

    // --- AI Prediction Engine ---
    useEffect(() => {
        const predict = async () => {
            // Derive arrays of names
            const symptomNames = Object.values(state.symptoms).map(s => s.name);
            const diagnosisNames = Object.values(state.diagnoses).map(d => d.name);

            // Only search if we have inputs
            if (symptomNames.length === 0 && diagnosisNames.length === 0) {
                if (state.suggestedDiagnoses?.length > 0 || state.suggestedMedicines?.length > 0) {
                    setState(prev => ({ ...prev, suggestedDiagnoses: [], suggestedMedicines: [] }));
                }
                return;
            }

            try {
                // Prepare filters
                let orFilter = "";
                const sList = symptomNames.length > 0 ? `and(source_type.eq.symptom,source_value.in.(${JSON.stringify(symptomNames).replace(/^\[|\]$/g, '')}))` : null;
                const dList = diagnosisNames.length > 0 ? `and(source_type.eq.diagnosis,source_value.in.(${JSON.stringify(diagnosisNames).replace(/^\[|\]$/g, '')}))` : null;

                if (sList && dList) orFilter = `${sList},${dList}`;
                else if (sList) orFilter = sList;
                else if (dList) orFilter = dList;

                // 1. Fetch Associations
                const { data } = await supabase
                    .from('opd_ai_associations')
                    .select('target_type, target_value, weight')
                    .or(orFilter);

                if (!data) return;

                // 2. Aggregate Scores
                const diagScores: Record<string, number> = {};
                const medScores: Record<string, number> = {};
                const invScores: Record<string, number> = {};
                const instScores: Record<string, number> = {};
                const procScores: Record<string, number> = {};

                data.forEach((row: any) => {
                    if (row.target_type === 'diagnosis') {
                        diagScores[row.target_value] = (diagScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'medicine') {
                        medScores[row.target_value] = (medScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'investigation') {
                        invScores[row.target_value] = (invScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'instruction') {
                        instScores[row.target_value] = (instScores[row.target_value] || 0) + row.weight;
                    } else if (row.target_type === 'procedure') {
                        procScores[row.target_value] = (procScores[row.target_value] || 0) + row.weight;
                    }
                });

                // 3. Sort & Extract
                const getTop = (scores: Record<string, number>, limit: number) => Object.entries(scores).sort(([, a], [, b]) => b - a).map(([k]) => k).slice(0, limit);

                setState(prev => ({
                    ...prev,
                    suggestedDiagnoses: getTop(diagScores, 10),
                    suggestedMedicines: getTop(medScores, 20),
                    suggestedInvestigations: getTop(invScores, 10),
                    suggestedInstructions: getTop(instScores, 10),
                    suggestedProcedures: getTop(procScores, 10),
                }));

            } catch (e) {
                console.error("AI Prediction Error", e);
            }
        };

        const timer = setTimeout(predict, 800);
        return () => clearTimeout(timer);
    }, [state.symptoms, state.diagnoses]);

    // --- Helpers for Normalization ---
    // Convert Array of objects to Record<Name, Object>
    const normalizeListToRecord = <T extends { name: string }>(list: T[] | null): Record<string, T> => {
        if (!list || !Array.isArray(list)) return {};
        return list.reduce((acc, item) => {
            acc[item.name] = item;
            return acc;
        }, {} as Record<string, T>);
    };

    // --- Load Data ---
    const loadData = async () => {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            const { data, error } = await supabase
                .from('opd_registration')
                .select('*')
                .eq('id', opdId)
                .single();

            if (error) throw error;

            if (data) {
                setState(prev => ({
                    ...prev,
                    isFinalized: data.is_finalized || false,
                    lastSavedAt: data.finalized_at || null,
                    symptoms: normalizeListToRecord(data.symptoms_list_json),
                    diagnoses: normalizeListToRecord(data.diagnosis_list_json),
                    medicines: data.rx_list_json || [],
                    instructions: data.instructions_list_json || [],
                    investigations: data.investigations_list_json || [],
                    procedures: data.procedures_list_json || [],
                    clinicalNote: data.clinical_notes || "",
                    followUpDuration: data.follow_up_duration || "",
                    followUpNote: data.follow_up_note || "",
                    referringDoctor: data.referring_doctor_name || "",
                    isLoading: false
                }));
            }
        } catch (e) {
            console.error("Error loading prescription data:", e);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    };

    useEffect(() => {
        loadData();
    }, [opdId]);

    // --- Actions Implementation ---

    // Symptoms
    const addSymptom = (detail: SymptomDetail) => {
        setState(prev => ({
            ...prev,
            symptoms: { ...prev.symptoms, [detail.name]: detail }
        }));
    };
    const removeSymptom = (name: string) => {
        setState(prev => {
            const next = { ...prev.symptoms };
            delete next[name];
            return { ...prev, symptoms: next };
        });
    };
    const updateSymptom = (name: string, updates: Partial<SymptomDetail>) => {
        setState(prev => {
            const current = prev.symptoms[name];
            if (!current) return prev;
            return {
                ...prev,
                symptoms: { ...prev.symptoms, [name]: { ...current, ...updates } }
            };
        });
    };

    // Diagnoses
    const addDiagnosis = (detail: DiagnosisDetail) => {
        setState(prev => ({
            ...prev,
            diagnoses: { ...prev.diagnoses, [detail.name]: detail }
        }));
    };
    const removeDiagnosis = (name: string) => {
        setState(prev => {
            const next = { ...prev.diagnoses };
            delete next[name];
            return { ...prev, diagnoses: next };
        });
    };
    const updateDiagnosis = (name: string, updates: Partial<DiagnosisDetail>) => {
        setState(prev => {
            const current = prev.diagnoses[name];
            if (!current) return prev;
            return {
                ...prev,
                diagnoses: { ...prev.diagnoses, [name]: { ...current, ...updates } }
            };
        });
    };

    // Medicines
    const addMedicine = (med: PrescriptionEntry) => {
        setState(prev => ({ ...prev, medicines: [...prev.medicines, med] }));
    };
    const removeMedicine = (id: string) => {
        setState(prev => ({ ...prev, medicines: prev.medicines.filter(m => m.id !== id) }));
    };
    const updateMedicine = (id: string, updates: Partial<PrescriptionEntry>) => {
        setState(prev => ({
            ...prev,
            medicines: prev.medicines.map(m => m.id === id ? { ...m, ...updates } : m)
        }));
    };
    const setMedicines = (meds: PrescriptionEntry[]) => {
        setState(prev => ({ ...prev, medicines: meds }));
    };

    // Others
    const setInstructions = (list: string[]) => setState(prev => ({ ...prev, instructions: list }));
    const setInvestigations = (list: string[]) => setState(prev => ({ ...prev, investigations: list }));
    const setProcedures = (list: string[]) => setState(prev => ({ ...prev, procedures: list }));

    const setClinicalNote = (n: string) => setState(prev => ({ ...prev, clinicalNote: n }));
    const setFollowUp = (d: string, n: string) => setState(prev => ({ ...prev, followUpDuration: d, followUpNote: n }));
    const setReferringDoctor = (n: string) => setState(prev => ({ ...prev, referringDoctor: n }));

    // Core
    const refreshData = async () => {
        await loadData();
    };

    const saveAndFinalize = async () => {
        setState(prev => ({ ...prev, isSaving: true }));
        try {
            const payload = {
                rx_list_json: state.medicines,
                symptoms_list_json: Object.values(state.symptoms),
                diagnosis_list_json: Object.values(state.diagnoses),
                instructions_list_json: state.instructions,
                investigations_list_json: state.investigations,
                procedures_list_json: state.procedures,
                clinical_notes: state.clinicalNote,
                follow_up_duration: state.followUpDuration,
                follow_up_note: state.followUpNote,
                referring_doctor_name: state.referringDoctor,

                is_finalized: true,
                finalized_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('opd_registration')
                .update(payload)
                .eq('id', opdId);

            if (error) throw error;

            // --- AI Learning Trigger (V2) ---
            try {
                // Fetch patient details for AI context
                // We could store age/gender in state, but simpler to fetch freshly or pass down.
                // For now, let's fetch shallowly or assume user is passing props.
                // Wait, opdId is prop. We can fetch patient meta.

                // Better approach: We have the record already or we can fetch it.
                // Let's rely on what we can get. 
                // Wait, we need age/gender. 
                // Let's do a quick fetch of patient details if not in state.
                const { data: opdRec } = await supabase.from('opd_registration').select('patient_detail(age_unit, age, gender)').eq('id', opdId).single();

                let p_age_group = 'adult';
                let p_gender = 'male';

                if (opdRec?.patient_detail) {
                    const pd = opdRec.patient_detail as any;
                    p_gender = pd.gender || 'male';

                    const age = Number(pd.age);
                    if (pd.age_unit === 'Y') {
                        if (age < 12) p_age_group = 'child';
                        else if (age > 60) p_age_group = 'senior';
                    } else {
                        p_age_group = 'child'; // Months/Days usually implies child
                    }
                }

                // Prepare complex objects
                const p_symptoms = Object.values(state.symptoms).map(s => ({
                    name: s.name,
                    severity: s.severity || '',
                    duration: s.duration || ''
                }));

                const p_diagnoses = Object.values(state.diagnoses).map(d => ({
                    name: d.name,
                    status: d.status || ''
                }));

                await supabase.rpc('learn_from_prescription_v2', {
                    p_age_group,
                    p_gender,
                    p_symptoms,
                    p_diagnoses,
                    p_medicines: state.medicines.map(m => m.name),
                    p_investigations: state.investigations,
                    p_instructions: state.instructions,
                    p_procedures: state.procedures
                });
            } catch (aiError) {
                console.error("AI Learning V2 failed:", aiError);
            }

            setState(prev => ({ ...prev, isFinalized: true, isSaving: false }));

            // Reload to sync backend state (optional but good practice)
            await loadData();

        } catch (e) {
            console.error("Save error:", e);
            alert("Failed to save prescription. Please try again.");
            setState(prev => ({ ...prev, isSaving: false }));
        }
    };

    return (
        <PrescriptionContext.Provider value={{
            ...state,
            addSymptom, removeSymptom, updateSymptom,
            addDiagnosis, removeDiagnosis, updateDiagnosis,
            addMedicine, removeMedicine, updateMedicine, setMedicines,
            setInstructions, setInvestigations, setProcedures,
            setClinicalNote, setFollowUp, setReferringDoctor,
            saveAndFinalize, refreshData
        }}>
            {children}
        </PrescriptionContext.Provider>
    );
}
