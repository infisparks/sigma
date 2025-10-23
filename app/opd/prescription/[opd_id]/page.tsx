"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form";
import { GoogleGenAI, File as GeminiFile } from "@google/genai";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Trash2,
  Mic,
  MicOff,
  RefreshCw,
  UserCheck,
  History,
  FileText,
  ArrowLeft,
  Eye,
  Download,
  Send,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO, parse, isValid } from "date-fns";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import Layout from "@/components/global/Layout";

// --- PrimeReact Import ---
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
// NOTE: Ensure PrimeReact CSS is imported globally in your Next.js setup:
// import "primereact/resources/themes/lara-light-indigo/theme.css"; 
// import "primereact/resources/primereact.min.css"; 
// --------------------------


const GEMINI_API_KEY = "AIzaSyAcw76IAvX5ZuJtrSGzXqy594TpU3BkCxA";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });


// --- Type Definitions ---
interface PatientDetail {
  patient_id: number;
  name: string;
  number: string | null;
  age: number | null;
  gender: string | null;
  address: string | null;
  age_unit: string | null;
  uhid: string;
}

interface MedicineItem {
  medicine_name: string;
  dosage: string;
  duration: string;
}

interface OPDPrescriptionRow {
  id: string;
  opd_id: number;
  uhid: string;
  problems: string | null;
  medicines: MedicineItem[] | null;
  advice_given: string | null; // Stays as string (newline-separated) in DB
  follow_up_date: string | null;
  investigations: string[] | null;
  category: string | null;
  
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface PrescriptionFormInputs {
  problems: string;
  medicines: MedicineItem[];
  advice_given: string; // Stays as string (newline-separated) in RHF
  follow_up_date: string;
  investigations: string[];
  category: string; 
}

interface AutoCompleteItem {
    id: number;
    name?: string; // Used for medicine name, category name, investigation name
    text?: string; // Used for advice
}

interface AutoCompleteData {
    medicine_suggestions: AutoCompleteItem[];
    problem_suggestions: AutoCompleteItem[];
    advice_suggestions: AutoCompleteItem[];
    investigation_suggestions: AutoCompleteItem[];
    patient_categories: AutoCompleteItem[];
}

const defaultFormValues: PrescriptionFormInputs = {
    problems: "",
    medicines: [], 
    advice_given: "",
    follow_up_date: "",
    investigations: [],
    category: "",
};
// --- End Type Definitions ---

// --- Core Gemini API Call Function (Client-Side) ---
async function getPrescriptionFromAudio(audioBlob: Blob): Promise<PrescriptionFormInputs> {
    const audioFile = new File([audioBlob], `conversation-${uuidv4()}.webm`, { type: 'audio/webm' });
    let uploadedFile: GeminiFile | null = null;

    try {
        toast.loading("Uploading audio to Gemini...", { id: 'gemini-upload' });
        uploadedFile = await ai.files.upload({
            file: audioFile,
            config: { mimeType: 'audio/webm' }
        });
        toast.success("Audio uploaded successfully.", { id: 'gemini-upload' });
        
        const prompt = `
            You are a medical scribe. Your task is to analyze the doctor-patient conversation in the provided audio file.
            Extract the following details and return them STRICTLY as a clean JSON object.
            
            - problems: The main complaints or diagnoses mentioned by the doctor.
            - medicines: An array of prescribed medications. Each item in the array should have 'medicine_name', 'dosage', and 'duration'.
            - advice_given: Specific lifestyle, dietary, or general health advice given. Each piece of advice should be a separate line, joined by a newline character (\\n).
            - follow_up_date: The date for the next visit. If a specific date is mentioned, provide it in 'YYYY-MM-DD' format. If no date is given, return "N/A".
            - investigations: A list of recommended tests/investigations. Return as an array of strings (e.g., ["CBC", "Urine R/M"]).

            The 'category' field is for internal use and should be omitted from the AI output.

            Ensure all fields are present in the JSON output, even if empty or "N/A".
            Format the output only as JSON.
        `;

        const prescriptionSchema = {
            type: "object",
            properties: {
                problems: { type: "string", description: "Main complaints or diagnoses." },
                medicines: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            medicine_name: { type: "string", description: "Name of the medicine (e.g., 'Tab. Demo Medicine 1')." },
                            dosage: { type: "string", description: "Dosage instructions (e.g., '1 Morning, 1 Night (Before Food)')." },
                            duration: { type: "string", description: "Duration of medication (e.g., '10 Days (Tot:20 Tab)')." },
                        },
                        required: ["medicine_name", "dosage", "duration"]
                    },
                    description: "Array of prescribed medicines with dosage and duration."
                },
                advice_given: { type: "string", description: "Specific lifestyle, dietary, or general health advice, newline-separated." },
                follow_up_date: { type: "string", description: "Date for follow-up (YYYY-MM-DD or 'N/A')." },
                investigations: { type: "array", items: { type: "string" }, description: "List of recommended investigations." },
            },
            required: ["problems", "medicines", "advice_given", "follow_up_date", "investigations"]
        };

        toast.loading("Analyzing conversation with AI...", { id: 'gemini-analysis' });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: [
                {
                    parts: [
                        { fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri } },
                        { text: prompt }
                    ]
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: prescriptionSchema,
                maxOutputTokens: 2048, 
            },
        });
        toast.success("AI analysis complete!", { id: 'gemini-analysis' });
        
        if (!response.text) {
             throw new Error("AI returned an empty response text (content likely blocked).");
        }

        const jsonText = response.text.trim().replace(/^```json|```$/g, '').trim();
        const parsedData = JSON.parse(jsonText) as PrescriptionFormInputs;
        
        if (!Array.isArray(parsedData.medicines)) parsedData.medicines = [];
        if (!Array.isArray(parsedData.investigations)) parsedData.investigations = [];
        
        (parsedData as any).category = ""; 

        return parsedData;

    } catch (error) {
        console.error("Gemini API Error:", error);
        toast.error(`AI analysis failed: ${(error as Error).message}`, { id: 'gemini-analysis' });
        throw new Error("Failed to generate prescription from audio.");
    } finally {
        if (uploadedFile && uploadedFile.name) {
            try {
                await ai.files.delete({ name: uploadedFile.name });
                console.log(`Cleaned up Gemini file: ${uploadedFile.name}`);
            } catch (cleanupError) {
                console.error("Error cleaning up Gemini file:", cleanupError);
            }
        }
    }
}
// --- End Core Gemini API Call Function ---


export default function OPDPrescriptionPage() {
  const { opd_id } = useParams<{ opd_id: string }>();
  const router = useRouter();

  // State
  const [patientData, setPatientData] = useState<PatientDetail | null>(null);
  const [currentPrescription, setCurrentPrescription] = useState<OPDPrescriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyModalItems, setHistoryModalItems] = useState<OPDPrescriptionRow[]>([]);
  
  const [autoCompleteData, setAutoCompleteData] = useState<AutoCompleteData>({
    medicine_suggestions: [],
    problem_suggestions: [],
    advice_suggestions: [],
    investigation_suggestions: [],
    patient_categories: [],
  });
  
  // Auto-complete state for static fields
  const [problemSearch, setProblemSearch] = useState('');
  const [adviceSearch, setAdviceSearch] = useState(''); 

  // State for PrimeReact AutoComplete suggestions
  const [medicineSuggestions, setMedicineSuggestions] = useState<AutoCompleteItem[]>([]); 
  const [categorySuggestions, setCategorySuggestions] = useState<AutoCompleteItem[]>([]);
  const [investigationSuggestions, setInvestigationSuggestions] = useState<AutoCompleteItem[]>([]);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Refs
  const prescriptionContentRef = useRef<HTMLDivElement>(null);

  // Form Management with React Hook Form
  const { register, handleSubmit, reset, setValue, control, watch } = useForm<PrescriptionFormInputs>({
    defaultValues: defaultFormValues,
  });

  // Watchers for dynamic fields
  const watchInvestigations = watch("investigations");
  const watchProblems = watch("problems");
  const watchAdvice = watch("advice_given");
  const watchCategory = watch("category"); 

  // Use useFieldArray for dynamic medicine inputs
  const { fields: medicineFields, append: appendMedicine, remove: removeMedicine } = useFieldArray({
    control,
    name: "medicines",
  });
  
  // --- Data Fetching: Auto-complete ---
  const fetchAutoCompleteData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("datasetapi")
        .select("dataname, datajson")
        .in("dataname", [
            "medicine_suggestions", "problem_suggestions", "advice_suggestions", 
            "investigation_suggestions", "patient_categories"
        ]);

      if (error) throw error;

      const newAutoCompleteData: Partial<AutoCompleteData> = {};
      data.forEach(item => {
        if (item.dataname) {
          (newAutoCompleteData as any)[item.dataname] = item.datajson || [];
        }
      });
      
      setAutoCompleteData(prev => ({ ...prev, ...(newAutoCompleteData as AutoCompleteData) }));
    } catch (error) {
      console.error("Error fetching auto-complete data:", error);
      toast.error("Failed to load suggestion lists.");
    }
  }, []);
  
  useEffect(() => {
      fetchAutoCompleteData();
  }, [fetchAutoCompleteData]);
  
  // --- Auto-complete Filtering Logic (Static Fields) ---
  
  const filteredProblemSuggestions = useMemo(() => {
    if (!problemSearch) return [];
    const search = problemSearch.toLowerCase().trim();
    return autoCompleteData.problem_suggestions
        ?.filter(item => item.name?.toLowerCase().includes(search))
        .slice(0, 5) || [];
  }, [problemSearch, autoCompleteData.problem_suggestions]);

  // Filter logic for Advice Textarea
  const filteredAdviceSuggestions = useMemo(() => {
    if (!autoCompleteData.advice_suggestions) return [];

    const lines = (adviceSearch || '').split('\n');
    const currentLine = lines[lines.length - 1].trim().replace(/^-/, '').trim();
    
    // If there is text on the current line, filter by it
    if (currentLine.length > 0) {
        const search = currentLine.toLowerCase();
        return autoCompleteData.advice_suggestions
            ?.filter(item => item.text?.toLowerCase().includes(search)) // Search by 'text' field
            .slice(0, 5) || [];
    }
    
    // If the current line is empty, but the textarea is not, show top suggestions
    // This happens right after selecting an item
    if (adviceSearch.trim().length === 0) {
        return []; // Don't show if the textarea is completely empty (initial state)
    }

    // If the textarea is not empty (e.g., "foo\n") but the current line is,
    // show the top 5 suggestions.
    return autoCompleteData.advice_suggestions.slice(0, 5);

  }, [adviceSearch, autoCompleteData.advice_suggestions]);


  // --- PrimeReact AutoComplete Handlers ---
  
  const searchAutoComplete = (query: string, suggestions: AutoCompleteItem[], setSuggestions: React.Dispatch<React.SetStateAction<AutoCompleteItem[]>>) => {
    const q = query.toLowerCase().trim();
    let filtered: AutoCompleteItem[];
    if (q.length === 0) {
        filtered = suggestions.slice(0, 8);
    } else {
        filtered = suggestions.filter((item) => {
            return item.name?.toLowerCase().includes(q);
        }).slice(0, 10);
    }
    setSuggestions(filtered);
  };
  
  const searchMedicine = (event: AutoCompleteCompleteEvent) => {
    searchAutoComplete(event.query, autoCompleteData.medicine_suggestions, setMedicineSuggestions);
  };

  const searchCategory = (event: AutoCompleteCompleteEvent) => {
    searchAutoComplete(event.query, autoCompleteData.patient_categories, setCategorySuggestions);
  };

  const searchInvestigation = (event: AutoCompleteCompleteEvent) => {
    searchAutoComplete(event.query, autoCompleteData.investigation_suggestions, setInvestigationSuggestions);
  };
  
  // --- Helper function to map RHF string value to PrimeReact tokens (objects)
  const getCategoryTokens = (categoryString: string): AutoCompleteItem[] => {
    if (!categoryString) return [];
    const categoryNames = categoryString.split(',').map(n => n.trim()).filter(n => n.length > 0);
    return autoCompleteData.patient_categories
        .filter(cat => cat.name && categoryNames.includes(cat.name));
  };

  // Helper function to map RHF string[] value to PrimeReact tokens (objects)
  const getInvestigationTokens = (investigationNames: string[]): AutoCompleteItem[] => {
    if (!investigationNames) return [];
    return autoCompleteData.investigation_suggestions
        .filter(inv => inv.name && investigationNames.includes(inv.name));
  };


  // --- Auto-complete Handlers (for static fields) ---
  const addProblemSuggestion = (suggestion: string) => {
    const currentText = watchProblems.trim();
    const newText = currentText + (currentText.length > 0 && !currentText.endsWith(' ') ? ' ' : '') + suggestion;
    setValue("problems", newText.trim());
    setProblemSearch('');
  };

  // Click handler for Advice suggestions
  const addAdviceSuggestion = (suggestion: string) => {
    const currentLines = watchAdvice.split('\n');
    currentLines.pop(); // Remove the partial line being typed
    currentLines.push(suggestion); // Add the full, selected suggestion
    currentLines.push(''); // Add a new empty line to start typing the next advice
    
    const newText = currentLines.join('\n');
    
    setValue("advice_given", newText, { shouldValidate: true });
    setAdviceSearch(newText); // Sync the search state to the new value
  };

  // --- Audio Recording Logic (Placeholders) ---
  const startRecording = async () => { /* Placeholder logic */ toast.info("Recording started (placeholder)"); };
  const stopRecording = () => { /* Placeholder logic */ toast.info("Recording stopped (placeholder)"); };
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessingAudio(true);
    const opdNum = opd_id;
    if (!opdNum) {
      toast.error("Missing OPD ID.");
      setIsProcessingAudio(false);
      return;
    }

    try {
      const aiData = await getPrescriptionFromAudio(audioBlob);

      // Populate form with AI results
      setValue("problems", aiData.problems || "");
      setValue("medicines", aiData.medicines || []); 
      setValue("advice_given", aiData.advice_given || "");
      setValue("follow_up_date", aiData.follow_up_date || "");
      setValue("investigations", aiData.investigations || []);
      
      toast.success("AI analysis complete! Prescription fields updated. Please review before saving.");

    } catch (err: any) {
      // Error handling is inside getPrescriptionFromAudio
    } finally {
      setIsProcessingAudio(false);
    }
  };
  // --- END Audio Recording Logic ---
  
  // --- Form Submission Logic ---
  const onSubmit: SubmitHandler<PrescriptionFormInputs> = async (formData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";
      const opdNum = Number(opd_id);
      const patientUHID = patientData?.uhid;

      if (!patientUHID) {
        toast.error("Patient UHID not found.");
        return;
      }

      let prescriptionPayload: Partial<OPDPrescriptionRow> = {
        opd_id: opdNum,
        uhid: patientUHID,
        problems: formData.problems,
        medicines: formData.medicines, 
        advice_given: formData.advice_given, // This is already a newline-separated string
        follow_up_date: formData.follow_up_date,
        investigations: formData.investigations,
        category: formData.category, 
        updated_at: new Date().toISOString(),
        updated_by: currentUserEmail,
      };

      if (currentPrescription) {
        const { error } = await supabase.from("opd_prescriptions").update(prescriptionPayload).eq("opd_id", opdNum);
        if (error) throw new Error(error.message);
      } else {
        const insertPayload = {
            ...prescriptionPayload,
            created_by: currentUserEmail,
            created_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("opd_prescriptions").insert(insertPayload);
        if (error) throw new Error(error.message);
      }
      
      toast.success("Prescription saved successfully!");
      await fetchPatientAndPrescriptionData();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Data Fetching & Component Logic ---
  const fetchPatientAndPrescriptionData = useCallback(async () => {
    if (!opd_id) { setIsLoading(false); return; }
    setIsLoading(true);
    const opdNum = Number(opd_id);
    try {
      const { data: opdData, error: opdError } = await supabase.from("opd_registration").select(`uhid, patient_detail:patient_detail!opd_registration_uhid_fkey (*)`).eq("opd_id", opdNum).single();
      if (opdError || !opdData) { 
        toast.error("Failed to load patient data."); 
        router.push("/opd/list/opdlistprescripitono"); 
        return; 
      }
      setPatientData(opdData.patient_detail as unknown as PatientDetail);
      
      const { data: presData, error: presError } = await supabase.from("opd_prescriptions").select("*").eq("opd_id", opdNum).single();
      
      if (presError && presError.code !== "PGRST116") { 
        toast.error("An error occurred while checking for existing prescription.");
        setCurrentPrescription(null);
        reset(defaultFormValues);
      }
      else if (presData) {
        setCurrentPrescription(presData);
        setValue("problems", presData.problems || "");
        setValue("medicines", (presData.medicines || []) as MedicineItem[]); 
        setValue("advice_given", presData.advice_given || ""); // Stored as newline string
        setValue("follow_up_date", presData.follow_up_date || "");
        setValue("investigations", (presData.investigations || []) as string[]);
        setValue("category", presData.category || "");
      } else {
        toast.info("No existing prescription found for this OPD ID. Starting new one.");
        setCurrentPrescription(null); 
        reset(defaultFormValues);
      }
    } catch (error) { 
      console.error("Error fetching patient/prescription data:", error);
      toast.error("An unexpected error occurred while fetching data."); 
      router.push("/opd/list/opdlistprescripitono"); 
    }
    finally { setIsLoading(false); }
  }, [opd_id, router, setValue, reset]);

  useEffect(() => { fetchPatientAndPrescriptionData(); }, [fetchPatientAndPrescriptionData]);

  // --- Real-time Subscription (omitted for brevity) ---
  useEffect(() => {
    if (!opd_id) return;
    const channel = supabase.channel(`opd_prescription_opd_id_${opd_id}`).on("postgres_changes", { event: "*", schema: "public", table: "opd_prescriptions", filter: `opd_id=eq.${opd_id}`}, payload => { toast.info(`Prescription data updated.`); fetchPatientAndPrescriptionData(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [opd_id, fetchPatientAndPrescriptionData]);

  // --- Helper Functions ---
  const clearPrescription = () => {
    reset(defaultFormValues);
    toast.info("Form cleared.");
  };

  // --- PDF & WhatsApp Functions (Placeholders) ---
  const generatePDFBlob = useCallback(async (prescriptionData: OPDPrescriptionRow | null) => {
      // ... (PDF generation logic remains the same)
      const dataToUse = prescriptionData || currentPrescription;
      if (!prescriptionContentRef.current || !patientData || !dataToUse) return null;
      
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const letterheadImage = "/letterhead.png";
      
      const originalRefStyle = prescriptionContentRef.current.style.cssText;
      prescriptionContentRef.current.style.position = "static";
      prescriptionContentRef.current.style.background = `url(${letterheadImage}) no-repeat center top / contain`;
      prescriptionContentRef.current.style.color = "#000";
      
      // Patient Header Section
      const patientHeaderHtml = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8mm; border-bottom: 1px solid #ccc; padding-bottom: 2mm;">
          <div><p style="font-size: 10pt;"><strong>Name:</strong> ${patientData.name}</p><p style="font-size: 10pt;"><strong>UHID:</strong> ${patientData.uhid}</p><p style="font-size: 10pt;"><strong>OPD ID:</strong> ${dataToUse.opd_id}</p></div>
          <div style="text-align: right;"><p style="font-size: 10pt;"><strong>Date:</strong> ${format(parseISO(dataToUse.created_at), "MMM dd, yyyy")}</p><p style="font-size: 10pt;"><strong>Age:</strong> ${patientData.age} ${patientData.age_unit || ""}</p><p style="font-size: 10pt;"><strong>Gender:</strong> ${patientData.gender}</p></div>
        </div>
      `;

      // Problems/Diagnosis Section
      const problemsHtml = dataToUse.problems 
        ? `<div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Problems / Diagnosis</h3><p style="font-size: 10pt;">${dataToUse.problems}</p></div>` 
        : '';

      // Medicines Table Section
      const medicinesHtml = dataToUse.medicines && dataToUse.medicines.length > 0
        ? `
          <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 2mm; border-bottom: 1px dashed #ccc;">Rx - Medicines Prescribed</h3>
            <table style="width:100%; border-collapse: collapse; margin-top: 2mm;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th style="border: 1px solid #ddd; padding: 4px; text-align: left; font-size: 10pt; width: 40%;">Medicine Name</th>
                  <th style="border: 1px solid #ddd; padding: 4px; text-align: left; font-size: 10pt; width: 35%;">Dosage</th>
                  <th style="border: 1px solid #ddd; padding: 4px; text-align: left; font-size: 10pt; width: 25%;">Duration</th>
                </tr>
              </thead>
              <tbody>
                ${dataToUse.medicines.map((med, index) => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 4px; font-size: 9pt;">${index + 1}) ${med.medicine_name}</td>
                    <td style="border: 1px solid #ddd; padding: 4px; font-size: 9pt;">${med.dosage}</td>
                    <td style="border: 1px solid #ddd; padding: 4px; font-size: 9pt;">${med.duration}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '';
        
      // Investigations Section
      const investigationsHtml = dataToUse.investigations && dataToUse.investigations.length > 0
        ? `
          <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Investigations Recommended</h3>
            <ul style="list-style-type: square; padding-left: 20px; margin-top: 2mm; margin-left: 5px;">
              ${dataToUse.investigations.map(inv => `
                <li style="font-size: 10pt; margin-bottom: 3px;">${inv}</li>
              `).join('')}
            </ul>
          </div>
        ` : '';

      // Advice Given Section
      // This logic remains the same as it already splits by newline
      const adviceGivenLines = dataToUse.advice_given ? dataToUse.advice_given.split('\n').filter(line => line.trim() !== '') : [];
      const adviceGivenHtml = adviceGivenLines.length > 0 
        ? `
          <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Advice Given</h3>
            <ul style="list-style-type: disc; padding-left: 20px; margin-top: 2mm; margin-left: 5px;">
              ${adviceGivenLines.map(line => `
                <li style="font-size: 10pt; margin-bottom: 3px;">${line.startsWith('-') ? line.substring(1).trim() : line.trim()}</li>
              `).join('')}
            </ul>
          </div>
        ` : '';

      // Follow-up Date Section
      let formattedFollowUpDate = "N/A";
      if (dataToUse.follow_up_date && dataToUse.follow_up_date !== "N/A") {
        let parsedDate = parse(dataToUse.follow_up_date, 'yyyy-MM-dd', new Date());
        if (!isValid(parsedDate)) { parsedDate = parseISO(dataToUse.follow_up_date); }
        if (isValid(parsedDate)) { formattedFollowUpDate = format(parsedDate, "MMM dd, yyyy"); }
      }

      const followUpHtml = `
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Follow Up Date</h3><p style="font-size: 10pt;">${formattedFollowUpDate}</p></div>
      `;

      // Combine all parts for the PDF
      prescriptionContentRef.current.innerHTML = `
        ${patientHeaderHtml}
        ${problemsHtml}
        ${medicinesHtml}
        ${investigationsHtml} 
        ${adviceGivenHtml}
        ${followUpHtml}
      `;
      
      const canvas = await html2canvas(prescriptionContentRef.current, { scale: 2 });
      pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", 0, 0, pdfWidth, canvas.height * pdfWidth / canvas.width);
      
      // Restore original state
      if (prescriptionContentRef.current) { 
        prescriptionContentRef.current.style.cssText = originalRefStyle; 
        prescriptionContentRef.current.innerHTML = ''; 
      }
      return pdf.output("blob");
  }, [patientData, currentPrescription]);

  const downloadPrescription = async () => { 
      toast.loading("Generating PDF...", { id: 'pdf-gen' });
      const pdfBlob = await generatePDFBlob(null);
      if (pdfBlob) {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Prescription_${patientData?.uhid}_OPD${opd_id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("PDF downloaded!", { id: 'pdf-gen' });
      } else {
        toast.error("Could not generate PDF.", { id: 'pdf-gen' });
      }
  };
  const uploadPdfAndSendWhatsApp = async () => { /* Placeholder logic */ toast.info("WhatsApp send functionality is a placeholder."); };
  const viewHistoryPrescription = async (historyItem: OPDPrescriptionRow) => { /* Placeholder logic */ toast.info("History view functionality is a placeholder."); };
  const fetchPreviousPrescriptions = useCallback(async () => { /* Placeholder logic */ toast.info("History fetching is a placeholder."); }, [patientData, currentPrescription]);

  useEffect(() => { if (showHistoryModal) fetchPreviousPrescriptions(); }, [showHistoryModal, fetchPreviousPrescriptions]);

  // --- Render Logic ---
  if (isLoading) return <div className="flex justify-center items-center min-h-screen"><RefreshCw className="h-10 w-10 animate-spin" /></div>;
  if (!patientData) return <div className="flex justify-center items-center min-h-screen text-red-600"><p>Patient data not found for OPD ID {opd_id}.</p></div>;

  return (
    <Layout>
      <div className="container mx-auto p-2 sm:p-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2"><FileText />OPD Prescription</h1>
          <Button onClick={() => router.push("/opd/list/opdlistprescripitono")} variant="outline" className="w-full sm:w-auto mt-2 sm:mt-0"><ArrowLeft className="h-4 w-4 mr-2" /> Back to List</Button>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{patientData.name} (UHID: {patientData.uhid})</CardTitle>
            <p className="text-sm text-gray-600">OPD ID: {opd_id}</p>
          </CardHeader>
          <CardContent>
            {/* Voice Recording and AI Processing Control */}
            <Button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessingAudio}
              className={`w-full mb-3 text-lg ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isProcessingAudio ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing Conversation...</>
              ) : isRecording ? (
                <><MicOff className="mr-2 animate-pulse h-5 w-5" /> Stop Recording</>
              ) : (
                <><Mic className="mr-2 h-5 w-5" /> Start Conversation Recording</>
              )}
            </Button>
            
            {isProcessingAudio && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-center font-medium">
                Please wait. AI is extracting prescription details from the audio. This may take up to a minute for long recordings.
              </div>
            )}
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              
              {/* Patient Category (Multi-select AutoComplete) */}
              <div>
                <label htmlFor="category" className="block text-sm font-medium">Internal Patient Category (For Analytics)</label>
                <AutoComplete
                    multiple
                    value={getCategoryTokens(watchCategory)} // RHF string to PrimeReact tokens
                    suggestions={categorySuggestions}
                    completeMethod={searchCategory}
                    field="name"
                    placeholder="Select or type categories..."
                    panelClassName="bg-white z-50 shadow-lg border border-gray-200"
                    appendTo="self"
                    
                    onChange={(e) => {
                        const categoryNames = (e.value as AutoCompleteItem[]).map(item => item.name).filter(n => n).join(', ');
                        setValue("category", categoryNames, { shouldValidate: true });
                    }}
                    
                    name="category"
                    onBlur={register("category").onBlur}
                    ref={register("category").ref}
                    
                    className="w-full"
                    inputClassName="w-full p-1 border rounded text-sm"
                />
              </div>

              {/* Problems / Diagnosis Input with Auto-complete */}
              <div>
                <label htmlFor="problems" className="block text-sm font-medium">1. Problems / Diagnosis</label>
                <div className="relative">
                  <Textarea 
                    id="problems" 
                    {...register("problems", { 
                        onChange: (e) => setProblemSearch(e.target.value) 
                    })} 
                    placeholder="Type 'fe' for 'Fever' suggestion. Manual edits possible." 
                    className="pr-10 text-sm min-h-[80px]" 
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("problems", "")}><Trash2 className="h-4 w-4" /></Button>
                  
                  {filteredProblemSuggestions.length > 0 && problemSearch.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {filteredProblemSuggestions.map((item) => (
                              <div 
                                  key={item.id} 
                                  className="p-2 text-sm cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                                  onClick={() => addProblemSuggestion(item.name || "")}
                              >
                                  {item.name} <Plus className="h-3 w-3 text-blue-500"/>
                              </div>
                          ))}
                      </div>
                  )}
                </div>
              </div>

              {/* Medicines Table Input with PrimeReact AutoComplete */}
              <div className="border rounded-lg p-3">
                <h3 className="font-semibold text-lg mb-3">2. Medicines Prescribed</h3>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine Name</TableHead>
                      <TableHead>Dosage</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="w-[40px]"></TableHead> 
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {medicineFields.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-gray-500">No medicines added yet.</TableCell></TableRow>
                    )}
                    {medicineFields.map((field, index) => {
                        const { onChange, ...rhfProps } = register(`medicines.${index}.medicine_name`);

                        return (
                            <TableRow key={field.id}>
                                <TableCell className="relative">
                                    <AutoComplete
                                        value={watch(`medicines.${index}.medicine_name`)}
                                        suggestions={medicineSuggestions}
                                        completeMethod={searchMedicine}
                                        panelClassName="bg-white z-50 shadow-lg border border-gray-200"
                                        
                                        onChange={(e) => {
                                            const newValue = typeof e.value === 'string' ? e.value : e.value?.name || '';
                                            setValue(`medicines.${index}.medicine_name`, newValue, { shouldValidate: true });
                                            onChange({
                                              target: {
                                                name: `medicines.${index}.medicine_name`,
                                                value: newValue,
                                              },
                                              type: 'change'
                                            } as React.ChangeEvent<HTMLInputElement>); 
                                        }}
                                        
                                        {...rhfProps}
                                        
                                        field="name"
                                        placeholder="Type medicine name..."
                                        className="w-full"
                                        inputClassName="w-full p-1 border rounded text-sm"
                                        appendTo="self" 
                                    />
                                </TableCell>
                                <TableCell>
                                    <input 
                                        {...register(`medicines.${index}.dosage`)} 
                                        placeholder="e.g., 1 Morning, 1 Night" 
                                        className="w-full p-1 border rounded text-sm" 
                                    />
                                </TableCell>
                                <TableCell>
                                    <input 
                                        {...register(`medicines.${index}.duration`)} 
                                        placeholder="e.g., 10 Days (Tot:20 Tab)" 
                                        className="w-full p-1 border rounded text-sm" 
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMedicine(index)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                  </TableBody>
                </Table>
                <Button type="button" onClick={() => appendMedicine({ medicine_name: "", dosage: "", duration: "" })} className="mt-3 w-full" variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> Manually Add Medicine Row
                </Button>
              </div>

              {/* Investigations Input (Multi-select AutoComplete) */}
              <div className="border rounded-lg p-3">
                <h3 className="font-semibold text-lg mb-3">3. Investigations Recommended</h3>
                <AutoComplete
                    multiple
                    value={getInvestigationTokens(watchInvestigations)} // RHF string array to PrimeReact tokens
                    suggestions={investigationSuggestions}
                    completeMethod={searchInvestigation}
                    field="name"
                    placeholder="Select investigations..."
                    panelClassName="bg-white z-50 shadow-lg border border-gray-200"
                    appendTo="self"
                    
                    onChange={(e) => {
                        const investigationNames = (e.value as AutoCompleteItem[]).map(item => item.name).filter(n => n) as string[];
                        setValue("investigations", investigationNames, { shouldValidate: true });
                    }}
                    
                    name="investigations"
                    onBlur={register("investigations").onBlur}
                    ref={register("investigations").ref}
                    
                    className="w-full"
                    inputClassName="w-full p-1 border rounded text-sm"
                />
              </div>

              {/* Advice Given Input (Back to Textarea) */}
              <div>
                <label htmlFor="advice_given" className="block text-sm font-medium">4. Advice Given (Each line will be a bullet point in PDF)</label>
                <div className="relative">
                  <Textarea 
                    id="advice_given" 
                    {...register("advice_given", { 
                        onChange: (e) => setAdviceSearch(e.target.value) 
                    })} 
                    placeholder="e.g., - Avoid oily and spicy food&#10;- Get plenty of rest" 
                    className="pr-10 text-sm min-h-[100px]" 
                  />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-1 right-2" 
                    onClick={() => {
                        setValue("advice_given", "");
                        setAdviceSearch(""); // Also clear the search state
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  
                  {/* This list will now re-appear after selection */}
                  {filteredAdviceSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {filteredAdviceSuggestions.map((item) => (
                              <div 
                                  key={item.id} 
                                  className="p-2 text-sm cursor-pointer hover:bg-gray-100 flex justify-between items-center"
                                  onClick={() => addAdviceSuggestion(item.text || "")}
                              >
                                  {item.text} <Plus className="h-3 w-3 text-blue-500"/>
                              </div>
                          ))}
                      </div>
                  )}
                </div>
              </div>


              {/* Follow-up Date Input */}
              <div>
                <label htmlFor="follow_up_date" className="block text-sm font-medium">5. Follow-up Date</label>
                <div className="relative">
                  <input type="date" id="follow_up_date" {...register("follow_up_date")} className="w-full p-2 border rounded text-sm pr-10" />
                  <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("follow_up_date", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <Button type="submit" disabled={isSubmitting || isProcessingAudio} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {isSubmitting ? <><RefreshCw className="mr-2 animate-spin"/>Saving...</> : <><UserCheck className="mr-2"/>Finalize & Save Prescription</>}
                </Button>
                <Button type="button" onClick={clearPrescription} variant="outline" className="flex-1 text-red-600 border-red-300 hover:bg-red-50" disabled={isProcessingAudio}>
                  <Trash2 className="mr-2"/>Clear Form
                </Button>
                
                {/* History Dialog */}
                <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
                  {/* Dialog Trigger and Content (Placeholder) */}
                  <DialogTrigger asChild>
                    {/* --- THIS IS THE FIX --- */}
                    <Button type="button" variant="outline" disabled={isProcessingAudio}>
                      <History className="mr-2"/>History
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[800px]">
                      <DialogHeader>
                          <DialogTitle>Prescription History</DialogTitle>
                          <DialogDescription>
                              Review past prescriptions for this patient (UHID: {patientData.uhid}).
                          </DialogDescription>
                      </DialogHeader>
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Problems</TableHead>
                                  <TableHead>Category</TableHead>
                                  <TableHead className="text-right">Action</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {historyModalItems.length === 0 ? (
                                  <TableRow><TableCell colSpan={4} className="text-center">No history found.</TableCell></TableRow>

                              ) : (
                                  historyModalItems.map(item => (
                                      <TableRow key={item.id}>
                                          <TableCell>{format(parseISO(item.created_at), 'MMM dd, yyyy')}</TableCell>
                                          <TableCell className="max-w-[200px] truncate">{item.problems || 'N/A'}</TableCell>
                                          <TableCell>{item.category || 'N/A'}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="outline" size="sm" onClick={() => viewHistoryPrescription(item)}><Eye className="h-4 w-4" /></Button>
                                          </TableCell>
                                      </TableRow>
                                  ))
                              )}
                          </TableBody>
                      </Table>
                  </DialogContent>
                </Dialog>
              </div>

              {currentPrescription && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button type="button" onClick={downloadPrescription} variant="secondary"><Download className="mr-2"/>View/Download PDF</Button>
                  <Button type="button" onClick={uploadPdfAndSendWhatsApp} disabled={isSendingWhatsApp || !patientData?.number} className="bg-green-500 hover:bg-green-600 text-white">
                    {isSendingWhatsApp ? <><RefreshCw className="mr-2 animate-spin"/>Sending...</> : <><Send className="mr-2"/>Send WhatsApp</>}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Hidden Div for PDF Generation (Ensure this is styled to match A4 for accurate output) */}
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <div ref={prescriptionContentRef} style={{ width: "210mm", minHeight: "297mm", padding: "60mm 15mm 15mm 15mm", color: "#000", fontFamily: "Arial, sans-serif", background: 'white' }}></div>
        </div>
      </div>
    </Layout>
  );
}