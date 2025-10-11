"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { format, parseISO, parse, isValid } from "date-fns"; 
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import Layout from "@/components/global/Layout";

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
  advice_given: string | null;
  follow_up_date: string | null; 
  
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface PrescriptionFormInputs {
  problems: string;
  medicines: MedicineItem[];
  advice_given: string;
  follow_up_date: string;
}
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
        
        // NEW PROMPT: Structured for the new format
        const prompt = `
            You are a medical scribe. Your task is to analyze the doctor-patient conversation in the provided audio file.
            Extract the following details and return them STRICTLY as a clean JSON object.
            
            - problems: The main complaints or diagnoses mentioned by the doctor.
            - medicines: An array of prescribed medications. Each item in the array should have 'medicine_name', 'dosage', and 'duration'.
            - advice_given: Specific lifestyle, dietary, or general health advice given. Each piece of advice should be a separate line, ideally prefixed with a hyphen for bullet points (e.g., "- Avoid oily and spicy food\n- Get plenty of rest").
            - follow_up_date: The date for the next visit. If a specific date is mentioned, provide it in 'YYYY-MM-DD' format. If no date is given, return "N/A".

            Ensure all fields are present in the JSON output, even if empty or "N/A".
            Format the output only as JSON.
        `;

        // NEW SCHEMA: Structured for the new format
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
                    description: "Array of prescribed medicines with dosage and duration details."
                },
                advice_given: { type: "string", description: "Specific lifestyle, dietary, or general health advice, line-separated for bullet points." },
                follow_up_date: { type: "string", description: "Date for follow-up (YYYY-MM-DD or 'N/A')." },
            },
            required: ["problems", "medicines", "advice_given", "follow_up_date"]
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
            // FIX: Nest responseMimeType, responseSchema, and maxOutputTokens under 'config'
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
        // Ensure medicines is always an array
        const parsedData = JSON.parse(jsonText) as PrescriptionFormInputs;
        if (!Array.isArray(parsedData.medicines)) {
            parsedData.medicines = [];
        }
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

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Refs
  const prescriptionContentRef = useRef<HTMLDivElement>(null);

  // Form Management with React Hook Form
  const { register, handleSubmit, reset, setValue, control } = useForm<PrescriptionFormInputs>({
    defaultValues: {
      problems: "",
      medicines: [], // Initialize medicines as an empty array
      advice_given: "",
      follow_up_date: "",
    },
  });

  // Use useFieldArray for dynamic medicine inputs
  const { fields: medicineFields, append: appendMedicine, remove: removeMedicine } = useFieldArray({
    control,
    name: "medicines",
  });

  // --- Audio Recording Logic ---
  const startRecording = async () => {
    if (isRecording || isProcessingAudio) return;
    try {
      if (!window.MediaRecorder || !navigator.mediaDevices) {
        toast.error("Recording is not supported by your browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event: BlobEvent) => { 
        if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop()); 
        
        if (audioBlob.size > 0) {
             processAudio(audioBlob);
        } else {
             toast.error("Recording failed or was too short.");
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      toast.info("Conversation recording started... Click 'Stop Recording' when finished.");
    } catch (err) {
      toast.error("Failed to start recording. Check microphone permissions.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };
  
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
      setValue("medicines", aiData.medicines || []); // Ensure it's an array
      setValue("advice_given", aiData.advice_given || "");
      setValue("follow_up_date", aiData.follow_up_date || "");
      
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

      // FIX: Use Partial<OPDPrescriptionRow> for a more flexible type, 
      // ensuring we only include necessary fields for the DB operation
      let prescriptionPayload: Partial<OPDPrescriptionRow> = {
        opd_id: opdNum,
        uhid: patientUHID,
        problems: formData.problems,
        medicines: formData.medicines, 
        advice_given: formData.advice_given,
        follow_up_date: formData.follow_up_date,
        updated_at: new Date().toISOString(),
        updated_by: currentUserEmail,
      };

      if (currentPrescription) {
        // Update: created_by and created_at remain unchanged
        const { error } = await supabase.from("opd_prescriptions").update(prescriptionPayload).eq("opd_id", opdNum);
        if (error) throw new Error(error.message);
      } else {
        // Insert: Add created_by and created_at
        const insertPayload = {
            ...prescriptionPayload,
            created_by: currentUserEmail,
            created_at: new Date().toISOString(), // Add created_at for new records
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
      if (opdError || !opdData) { toast.error("Failed to load patient data."); router.push("/opd/list/opdlistprescripitono"); return; }
      setPatientData(opdData.patient_detail as unknown as PatientDetail);
      
      const { data: presData, error: presError } = await supabase.from("opd_prescriptions").select("*").eq("opd_id", opdNum).single();
      if (presError && presError.code !== "PGRST116") { 
        toast.info("No existing prescription found for this OPD ID. Starting new one.");
        setCurrentPrescription(null); 
        reset(); 
      }
      else if (presData) {
        setCurrentPrescription(presData);
        // Map fetched data to form fields
        setValue("problems", presData.problems || "");
        setValue("medicines", (presData.medicines || []) as MedicineItem[]); 
        setValue("advice_given", presData.advice_given || "");
        setValue("follow_up_date", presData.follow_up_date || "");
      } else {
        setCurrentPrescription(null); 
        reset(); 
      }
    } catch (error) { 
      console.error("Error fetching patient/prescription data:", error);
      toast.error("An unexpected error occurred while fetching data."); 
      router.push("/opd/list/opdlistprescripitono"); 
    }
    finally { setIsLoading(false); }
  }, [opd_id, router, setValue, reset]);

  useEffect(() => { fetchPatientAndPrescriptionData(); }, [fetchPatientAndPrescriptionData]);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!opd_id) return;
    const channel = supabase.channel(`opd_prescription_opd_id_${opd_id}`).on("postgres_changes", { event: "*", schema: "public", table: "opd_prescriptions", filter: `opd_id=eq.${opd_id}`}, payload => { toast.info(`Prescription data updated.`); fetchPatientAndPrescriptionData(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [opd_id, fetchPatientAndPrescriptionData]);

  // --- Helper Functions ---
  const clearPrescription = () => {
    reset({
      problems: "",
      medicines: [],
      advice_given: "",
      follow_up_date: "",
    });
    toast.info("Form cleared.");
  };

  // --- PDF & WhatsApp Functions ---
  const generatePDFBlob = useCallback(async (prescriptionData: OPDPrescriptionRow | null) => {
      const dataToUse = prescriptionData || currentPrescription;
      if (!prescriptionContentRef.current || !patientData || !dataToUse) return null;
      
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const letterheadImage = "/letterhead.png";
      
      const originalRefStyle = prescriptionContentRef.current.style.cssText;
      prescriptionContentRef.current.style.position = "static";
      prescriptionContentRef.current.style.background = `url(${letterheadImage}) no-repeat center top / contain`;
      prescriptionContentRef.current.style.color = "#000";
      
      // Patient Header Section (remains largely same)
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
          <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 2mm; border-bottom: 1px dashed #ccc;">Medicines Prescribed</h3>
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

      // Advice Given Section (formatted with bullet points)
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
        if (!isValid(parsedDate)) {
            parsedDate = parseISO(dataToUse.follow_up_date);
        }
        if (isValid(parsedDate)) {
            formattedFollowUpDate = format(parsedDate, "MMM dd, yyyy");
        }
      }

      const followUpHtml = `
        <div style="margin-bottom: 5mm;"><h3 style="font-size: 13pt; margin-bottom: 1mm; border-bottom: 1px dashed #ccc;">Follow Up Date</h3><p style="font-size: 10pt;">${formattedFollowUpDate}</p></div>
      `;

      // Combine all parts for the PDF
      prescriptionContentRef.current.innerHTML = `
        ${patientHeaderHtml}
        ${problemsHtml}
        ${medicinesHtml}
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
      const pdfBlob = await generatePDFBlob(currentPrescription);
      if (!pdfBlob) { toast.error("Failed to generate PDF."); return; }
      const blobURL = URL.createObjectURL(pdfBlob);
      window.open(blobURL, "_blank");
      toast.success("PDF opened successfully!");
  };
  
  const uploadPdfAndSendWhatsApp = async () => {
      if (!currentPrescription || !patientData?.number) { toast.error(!patientData?.number ? "Patient phone number missing." : "Prescription data not loaded."); return; }
      setIsSendingWhatsApp(true);
      try {
        const pdfBlob = await generatePDFBlob(currentPrescription);
        if (!pdfBlob) throw new Error("Failed to generate PDF for WhatsApp.");
        const fileName = `prescription-${patientData.uhid}-${uuidv4()}.pdf`;
        const { error: uploadError } = await supabase.storage.from("dpr-documents").upload(`opd_prescriptions/${fileName}`, pdfBlob);
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        const { data: { publicUrl } } = supabase.storage.from("dpr-documents").getPublicUrl(`opd_prescriptions/${fileName}`);
        if (!publicUrl) throw new Error("Failed to get public URL.");
        // Corrected Line
const numberAsString = String(patientData.number);
const formattedNumber = numberAsString.startsWith("91") ? numberAsString : `91${numberAsString}`;
        const response = await fetch("https://a.infispark.in/send-image-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "9958399157", number: formattedNumber, imageUrl: publicUrl, caption: `Dear ${patientData.name}, here is your prescription for OPD ID ${opd_id}.` }) });
        if (!response.ok) throw new Error(`API Error: ${await response.text()}`);
        const result = await response.json();
        if (result.status === "success") toast.success("Prescription sent via WhatsApp!");
        else toast.error(`WhatsApp failed: ${result.message || "Unknown error"}`);
      } catch (error: any) { toast.error(`WhatsApp Error: ${error.message}`); }
      finally { setIsSendingWhatsApp(false); }
  };
  
  const viewHistoryPrescription = async (historyItem: OPDPrescriptionRow) => {
      const pdfBlob = await generatePDFBlob(historyItem);
      if (!pdfBlob) { toast.error("Failed to generate historical PDF."); return; }
      window.open(URL.createObjectURL(pdfBlob), "_blank");
  };
  
  // --- History Fetching ---
  const fetchPreviousPrescriptions = useCallback(async () => {
    if (!patientData?.uhid) return;
    try {
      const { data, error } = await supabase.from("opd_prescriptions").select("*").eq("uhid", patientData.uhid).order("created_at", { ascending: false });
      if (error) throw error;
      setHistoryModalItems(data.filter((item) => item.opd_id !== currentPrescription?.opd_id));
    } catch { toast.error("Failed to load history."); }
  }, [patientData, currentPrescription]);

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
              {/* Problems / Diagnosis Input */}
              <div>
                <label htmlFor="problems" className="block text-sm font-medium">1. Problems / Diagnosis</label>
                <div className="relative">
                  <Textarea id="problems" {...register("problems")} placeholder="AI results for problems/diagnosis will appear here. Manual edits possible." className="pr-10 text-sm min-h-[80px]" />
                  <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("problems", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Medicines Table Input */}
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
                    {medicineFields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <input 
                            {...register(`medicines.${index}.medicine_name`)} 
                            placeholder="e.g., Tab. Demo Medicine 1" 
                            className="w-full p-1 border rounded text-sm" 
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
                    ))}
                  </TableBody>
                </Table>
                <Button type="button" onClick={() => appendMedicine({ medicine_name: "", dosage: "", duration: "" })} className="mt-3 w-full" variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> Add Medicine
                </Button>
              </div>

              {/* Advice Given Input */}
              <div>
                <label htmlFor="advice_given" className="block text-sm font-medium">3. Advice Given (Each line will be a bullet point in PDF)</label>
                <div className="relative">
                  <Textarea id="advice_given" {...register("advice_given")} placeholder="e.g., - Avoid oily and spicy food&#10;- Get plenty of rest&#10;- Drink lots of water" className="pr-10 text-sm min-h-[100px]" />
                  <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-2" onClick={() => setValue("advice_given", "")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Follow-up Date Input */}
              <div>
                <label htmlFor="follow_up_date" className="block text-sm font-medium">4. Follow-up Date</label>
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
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1" disabled={isProcessingAudio}><History className="mr-2" /> View History</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px]">
                    <DialogHeader>
                      <DialogTitle>Previous Prescriptions for {patientData.name}</DialogTitle>
                      <DialogDescription>This is a history of prescriptions for this patient.</DialogDescription>
                    </DialogHeader>
                    {historyModalItems.length > 0 ? (
                      <div className="overflow-auto max-h-[60vh]">
                        <Table>
                          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Problems</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                          <TableBody>{historyModalItems.map((item: OPDPrescriptionRow) => ( 
                              <TableRow key={item.id}>
                                <TableCell>{format(parseISO(item.created_at), "MMM dd, yyyy")}</TableCell>
                                <TableCell className="whitespace-normal max-w-[200px] overflow-hidden text-ellipsis">{item.problems || "N/A"}</TableCell>
                                <TableCell><Button size="sm" onClick={() => viewHistoryPrescription(item)}><Eye className="h-4 w-4 mr-1" /> View PDF</Button></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500">No previous prescriptions found.</p>
                    )}
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

        {/* Hidden Div for PDF Generation */}
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <div ref={prescriptionContentRef} style={{ width: "210mm", minHeight: "297mm", padding: "60mm 15mm 15mm 15mm", color: "#000", fontFamily: "Arial, sans-serif", background: 'white' }}></div>
        </div>
      </div>
    </Layout>
  );
}