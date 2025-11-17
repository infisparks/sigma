// app/pathology/patient-entry/page.tsx
"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useForm } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { UserCircle, Phone, FlaskConical, Stethoscope, UserPlus, X, Hospital } from "lucide-react"
import { useRouter } from "next/navigation"
import { useUserRole } from "@/hooks/useUserRole"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

import PathologyRegistration from "./PathologyRegistration" 
import XrayRegistration from "./XrayRegistration"         

// --- Helpers and Constants ---
const TABLE = {
  PATIENT: "patient_detail",
  DOCTOR: "zdoctorlist",
  PACKAGE: "zpackages",
  BLOOD: "zblood_test",
  OPD_REGISTRATION: "opd_registration", 
  IPD_REGISTRATION: "ipd_registration", 
} as const

function throwIfError(error: any) {
  if (error) throw error
}

// Helper to format ISO date string to a readable date/time (for OPD/IPD popover)
function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

// Initial date/time setup for defaults
const initialDate = new Date()
const defaultDate = initialDate.toISOString().slice(0, 10)
const defaultTime = (() => {
  const h12 = initialDate.getHours() % 12 || 12
  const mer = initialDate.getHours() >= 12 ? "PM" : "AM"
  return `${String(h12).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")} ${mer}`
})()

// --- Types ---

interface BloodTestRow { id: number; test_name: string; price: number; outsource: boolean; estimated_time_mm: string | null; }
interface PackageType { id: number; package_name: string; tests: any[]; discountamount: number; }
interface PatientSuggestion { id: number; name: string; number: number; uhid: string; title?: string; age: number; age_unit: "year" | "month" | "day"; gender: string; address?: string; }
interface OpdRegistration { opd_id: number; date: string; refer_by: string; }
interface IpdRegistration { ipd_id: number; admission_date: string; admission_time: string; under_care_of_doctor: string; bed_id: number; discharge_date: string | null; bed_management: { bed_number: string | null; room_type: string | null; } | null; }

export type VisitType = "direct" | "opd" | "ipd";
export type TpaType = boolean;
export type ActiveTab = 'Pathology' | 'Xray';

// Nested Service Data Structures
interface PathologyData {
    estimatedTime: string;
    bloodTests: any[];
    discountAmount: number;
    paymentEntries: any[];
}
interface XrayData {
    billNumber: string;
    remark: string;
    dateOfAppointment: Date;
    xrayTests: any[];
    discount: number;
    payments: any[];
}
export interface IUnifiedFormInput {
    // Patient Details (Managed by Parent RHF)
    title: string;
    name: string;
    contact: string;
    age: number;
    dayType: "year" | "month" | "day";
    gender: string;
    address?: string;
    uhid: string; 
    
    // Registration Details (Managed by Parent RHF, synced by active child)
    hospitalName: string;
    visitType: VisitType;
    doctorName: string;
    tpa: TpaType;
    registrationDate: string;
    registrationTime: string;
    sendWhatsApp: boolean;
    sourceOpdId: number | null; 
    sourceIpdId: number | null; 

    // Nested Service Data (Managed by Child State/RHF)
    pathology: PathologyData;
    xray: XrayData;
}

const getDefaultUnifiedFormValues = (): IUnifiedFormInput => ({
    title: "", name: "", contact: "", age: 0, dayType: "year", gender: "", address: "", uhid: "",
    hospitalName: "MEDFORD HOSPITAL", visitType: "direct", doctorName: "", tpa: false,
    registrationDate: defaultDate, registrationTime: defaultTime, sendWhatsApp: true,
    sourceOpdId: null, sourceIpdId: null,
    pathology: { estimatedTime: "1100", bloodTests: [], discountAmount: 0, paymentEntries: [] },
    xray: { billNumber: "", remark: "", dateOfAppointment: new Date(), xrayTests: [{ examination: "", amount: 0 }], discount: 0, payments: [] }
})

// --- Main Component ---

export default function UnifiedPatientEntry() {
  const router = useRouter()
  const { role } = useUserRole()
  const [activeTab, setActiveTab] = useState<ActiveTab>('Pathology');
  const [doctorList, setDoctorList] = useState<{ id: number; doctor_name: string }[]>([])
  const [bloodRows, setBloodRows] = useState<BloodTestRow[]>([])
  const [packageRows, setPackageRows] = useState<PackageType[]>([])
  const [patientHints, setPatientHints] = useState<PatientSuggestion[]>([])
  const [showPatientHints, setShowPatientHints] = useState(false)
  const [opdRecords, setOpdRecords] = useState<OpdRegistration[]>([]) 
  const [ipdRecords, setIpdRecords] = useState<IpdRegistration[]>([]) 
  const [showSourceSelection, setShowSourceSelection] = useState(false) 

  // --- RHF Setup for Unified Patient Data ---
  const {
    register,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<IUnifiedFormInput>({
    defaultValues: getDefaultUnifiedFormValues(),
  })
  
  // Local state to manage the service-specific parts (Pathology/Xray)
  const [pathologyData, setPathologyData] = useState<IUnifiedFormInput['pathology']>(getDefaultUnifiedFormValues().pathology);
  const [xrayData, setXrayData] = useState<IUnifiedFormInput['xray']>(getDefaultUnifiedFormValues().xray);
  
  const isExistingPatient = Boolean(watch("uhid"))
  const patientHintsRef = useRef<HTMLDivElement | null>(null)
  const sourceSelectionRef = useRef<HTMLDivElement | null>(null)

  // Patient Data Object to pass down
  const watchFields = watch();
  
  const patientData = useMemo(() => ({
      uhid: watchFields.uhid, name: watchFields.name, contact: watchFields.contact, age: watchFields.age,
      dayType: watchFields.dayType, title: watchFields.title, address: watchFields.address, gender: watchFields.gender,
  }), [watchFields]);
  
  // Registration Data Object to pass down
  const commonRegDetails = useMemo(() => ({
      hospitalName: watchFields.hospitalName, visitType: watchFields.visitType, doctorName: watchFields.doctorName, tpa: watchFields.tpa, 
      registrationDate: watchFields.registrationDate, registrationTime: watchFields.registrationTime, sendWhatsApp: watchFields.sendWhatsApp,
      sourceOpdId: watchFields.sourceOpdId, sourceIpdId: watchFields.sourceIpdId
  }), [watchFields]);

  // Function to update the RHF fields from the child component
  const handleUpdateRHF = useCallback((key: keyof IUnifiedFormInput, value: any) => {
    if (key in getDefaultUnifiedFormValues()) {
        setValue(key, value);
    }
  }, [setValue]);


  // --- Initial Data Fetching ---
  useEffect(() => {
    if (role === 'xray') { router.replace('/x-rayDashboard'); return; }
    
    const fetchLists = async () => {
        try {
            const { data: doctors, error: dErr } = await supabase.from(TABLE.DOCTOR).select("id, doctor_name").order("doctor_name")
            throwIfError(dErr)
            setDoctorList(doctors ?? [])

            const { data: bloods, error: bErr } = await supabase.from(TABLE.BLOOD).select("id, test_name, price, outsource, estimated_time_mm").order("test_name")
            throwIfError(bErr)
            setBloodRows(bloods ?? [])

            const { data: packages, error: pErr } = await supabase.from(TABLE.PACKAGE).select("id, package_name, tests, discountamount")
            throwIfError(pErr)
            setPackageRows(packages ?? [])
        } catch (error) {
            console.error("Error fetching initial data:", error);
        }
    }
    fetchLists();
  }, [role, router])

  // Auto-set gender based on title
  useEffect(() => {
    const titleValue = watch("title")
    const male = new Set(["MR", "MAST", "BABA"])
    const female = new Set(["MS", "MISS", "MRS", "BABY", "SMT"])
    const none = new Set(["BABY OF", "DR", "", "."])
    if (male.has(titleValue)) setValue("gender", "male")
    else if (female.has(titleValue)) setValue("gender", "female")
    else if (none.has(titleValue)) setValue("gender", "")
  }, [watch("title"), setValue])

  // --- Click Outside Handler for Hints ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (patientHintsRef.current && !patientHintsRef.current.contains(target)) {
        setShowPatientHints(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // --- Patient Search/Hints logic (Name/Contact) ---
  useEffect(() => {
    const searchString = (watch("name").trim() || watch("contact").trim())
    if (isExistingPatient || !searchString || searchString.length < 2) {
      setPatientHints([]);
      return;
    }

    const timer = setTimeout(async () => {
      let query = supabase.from(TABLE.PATIENT).select("id:patient_id, name, number, uhid, title, age, age_unit, gender, address").limit(10);
      if (watch("name").trim().length >= 2) {
        query = query.ilike("name", `${watch("name").trim()}%`);
      } else if (watch("contact").trim().length >= 2) {
        query = query.like("number", `${watch("contact").trim()}%`);
      } else {
        setPatientHints([]);
        return;
      }

      const { data, error } = await query;
      throwIfError(error);
      setPatientHints((data || []) as PatientSuggestion[]);
      setShowPatientHints(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [watch("name"), watch("contact"), isExistingPatient]);


  // --- Patient Selection/Handling ---
  async function handlePatientSelect(p: PatientSuggestion) {
    setValue("name", p.name); setValue("contact", p.number.toString()); setValue("age", p.age);
    setValue("dayType", p.age_unit); setValue("gender", p.gender); setValue("title", p.title || "");
    setValue("address", p.address || "");
    setValue("uhid", p.uhid); 
    
    setValue("visitType", "direct"); setValue("sourceOpdId", null); setValue("sourceIpdId", null);
    setShowPatientHints(false);

    const { data: registrationData, error: registrationError } = await supabase
        .from("zregistration" as any) 
        .select("doctor_name")
        .eq("UHID", p.uhid)
        .order("registration_time", { ascending: false })
        .limit(1)

    if (registrationError) { console.error("Error fetching latest registration:", registrationError) } 
    else if (registrationData && registrationData.length > 0) { setValue("doctorName", registrationData[0].doctor_name || "") } 
    else { setValue("doctorName", "") }
  }

  function handleNewPatient() {
    reset(getDefaultUnifiedFormValues());
    setPathologyData(getDefaultUnifiedFormValues().pathology);
    setXrayData(getDefaultUnifiedFormValues().xray);
    setShowSourceSelection(false);
  }

  // --- Source Selection Logic (OPD/IPD) - Passed down to child components ---
  const fetchSourceRecords = useCallback(async (uhid: string, visitType: 'opd' | 'ipd', autoOpen: boolean = false) => {
    try {
      if (visitType === 'opd') {
        const { data, error } = await supabase.from(TABLE.OPD_REGISTRATION).select("opd_id, date, refer_by").eq("uhid", uhid).order("date", { ascending: false }).limit(10);
        throwIfError(error);
        setOpdRecords(data || []);
        if ((data || []).length > 0 && autoOpen) { setShowSourceSelection(true); }
      } else if (visitType === 'ipd') {
        const { data, error } = await supabase.from(TABLE.IPD_REGISTRATION).select(`ipd_id, admission_date, admission_time, under_care_of_doctor, bed_id, discharge_date, bed_management (bed_number, room_type) `).eq("uhid", uhid).order("admission_date", { ascending: false }).limit(10);
        throwIfError(error);
        const formattedData = (data || []).map((record: any) => ({ ...record, bed_management: record.bed_management?.[0] || null, })) as IpdRegistration[];
        setIpdRecords(formattedData);
        if (formattedData.length > 0 && autoOpen) { setShowSourceSelection(true); }
      }
    } catch (error: any) {
      console.error("Error fetching source records:", error);
      alert(error.message || "Failed to fetch source records (Check RLS/Network).");
      setShowSourceSelection(false);
    }
  }, []);

  // --- Source Selection Popover Component (Remains in Parent) ---
  const SourceSelectionPopover = () => {
    if (!showSourceSelection) return null;

    const isOpd = commonRegDetails.visitType === 'opd';
    const records = isOpd ? opdRecords : ipdRecords;
    const selectedId = isOpd ? commonRegDetails.sourceOpdId : commonRegDetails.sourceIpdId;

    const handleSelect = (id: number, doctorName: string) => {
      if (isOpd) { setValue("sourceOpdId", id); setValue("sourceIpdId", null); } 
      else { setValue("sourceIpdId", id); setValue("sourceOpdId", null); }
      setValue("doctorName", doctorName);
      setShowSourceSelection(false);
    };

    const clearSelection = () => {
      setValue("sourceOpdId", null); setValue("sourceIpdId", null); setValue("visitType", "direct");
      setShowSourceSelection(false);
    };

    if (records.length === 0) return null; 

    return (
      <div
        ref={sourceSelectionRef}
        className="absolute z-50 w-[95%] max-w-2xl bg-white border border-blue-400 rounded-lg shadow-xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4"
      >
        <div className="flex justify-between items-center mb-3 border-b pb-2">
          <h4 className="text-xl font-bold text-blue-600 flex items-center"><Hospital className="h-5 w-5 mr-2" /> Select Source {isOpd ? "OPD" : "IPD"} Registration</h4>
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection} className="h-8 w-8 p-0"><X className="h-5 w-5 text-gray-500" /></Button>
        </div>
        <p className="text-sm text-gray-600 mb-3">Patient: <span className="font-semibold">{patientData.name}</span> (UHID: <span className="font-semibold">{patientData.uhid}</span>)</p>

        <div className="max-h-60 overflow-y-auto border rounded">
          <table className="min-w-full">
            <thead>
              <tr><th>ID</th><th>{isOpd ? "Date/Time" : "Admission Date"}</th><th>{isOpd ? "Referred By" : "Doctor / Room Info"}</th>{!isOpd && <th>Status</th>}<th>Select</th></tr>
            </thead>
            <tbody>
              {isOpd
                ? (records as OpdRegistration[]).map((r) => (
                    <tr key={r.opd_id} className={r.opd_id === selectedId ? 'bg-blue-50' : ''}>
                      <td>{r.opd_id}</td><td>{formatDate(r.date)}</td><td>{r.refer_by}</td>
                      <td><Checkbox checked={r.opd_id === selectedId} onCheckedChange={() => handleSelect(r.opd_id, r.refer_by)} /></td></tr>
                  ))
                : (records as IpdRegistration[]).map((r) => {
                    const status = r.discharge_date ? 'Discharged' : 'Active'; 
                    return (<tr key={r.ipd_id} className={r.ipd_id === selectedId ? 'bg-blue-50' : ''}>
                        <td>{r.ipd_id}</td><td>{formatDate(r.admission_date)}</td><td>{r.under_care_of_doctor}</td>
                        <td>{status}</td><td><Checkbox checked={r.ipd_id === selectedId} onCheckedChange={() => handleSelect(r.ipd_id, r.under_care_of_doctor)} /></td></tr>);
                  })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-right"><Button type="button" onClick={() => setShowSourceSelection(false)} disabled={!selectedId} className="bg-blue-600 hover:bg-blue-700">Confirm Selection</Button></div>
      </div>
    );
  };


  if (role === 'xray') { return null; }

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {showSourceSelection && (<div className="absolute inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center"><SourceSelectionPopover /></div>)}
      <div className="flex-1 overflow-auto p-3">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-3 flex items-center"><UserPlus className="mr-2 w-6 h-6 text-blue-600" />Unified Patient & Service Entry</h1>
        <Card className="rounded-xl shadow-lg border border-gray-200">
          <CardContent className="p-3">
            {/* 1. Patient Information Card (Common to all services) */}
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-bold text-blue-800">Patient Details</h2>
                    {isExistingPatient && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-blue-600 font-medium">Existing Patient (UHID: {watch("uhid")})</span>
                            <Button type="button" variant="outline" size="sm" onClick={handleNewPatient} className="h-7 px-2 py-0 text-xs">Clear & Add New</Button>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-12 gap-2 mb-3">
                    <div className="col-span-1"> <Label className="text-sm">Title</Label>
                      <Select value={watch("title")} onValueChange={(v) => setValue("title", v)} disabled={isExistingPatient} ><SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{[".", "MR", "MRS", "MAST", "BABA", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (<SelectItem key={t} value={t}>{t === "." ? "NoTitle" : t}</SelectItem>))}</SelectContent></Select></div>
                    <div className="col-span-4 relative" ref={patientHintsRef}> <Label className="text-sm">Full Name</Label>
                      <div className="relative"><Input {...register("name", { required: "Name is required", onChange: (e) => { if (!isExistingPatient) { setShowPatientHints(true); setValue("name", e.target.value.toUpperCase()); setValue("uhid", ""); } }, })} className={`h-8 pl-10 ${isExistingPatient ? "bg-blue-100 border-blue-300" : ""}`} placeholder="Type at least 2 letters..." onFocus={() => setShowPatientHints(true)} readOnly={isExistingPatient} /><UserCircle className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" /></div>
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                      {showPatientHints && patientHints.length > 0 && (<ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                          {patientHints.map((p) => (<li key={p.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0" onClick={() => handlePatientSelect(p)} >
                              <div className="font-medium text-gray-900"><span className="text-blue-600 font-bold mr-2">UHID: {p.uhid}</span> {p.name}</div>
                              <div className="text-xs text-gray-500">{p.number} • {p.age}{p.age_unit.charAt(0).toUpperCase()} • {p.gender}</div></li>))}
                        </ul>)}</div>
                    <div className="col-span-3"> <Label className="text-sm">Contact Number</Label>
                      <div className="relative"><Input {...register("contact", { required: "Phone number is required", pattern: { value: /^[0-9]{10}$/, message: "Phone number must be 10 digits" }, onChange: () => setShowPatientHints(true) })} className={`h-8 pl-10 ${isExistingPatient ? "bg-blue-100 border-blue-300" : ""}`} placeholder="Enter 10-digit mobile number" onFocus={() => setShowPatientHints(true)} readOnly={isExistingPatient} /><Phone className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" /></div>
                      {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}</div>
                    <div className="col-span-1"> <Label className="text-sm">Age</Label>
                      <Input type="number" {...register("age", { required: "Age is required", min: { value: 0, message: "Age must be positive" }, valueAsNumber: true })} className={`h-8 ${isExistingPatient ? "bg-blue-100 border-blue-300" : ""}`} readOnly={isExistingPatient} />
                      {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}</div>
                    <div className="col-span-1"> <Label className="text-sm">Unit</Label>
                      <Select value={watch("dayType")} onValueChange={(v) => setValue("dayType", v as any)} disabled={isExistingPatient} ><SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-100 border-blue-300" : ""}`}><SelectValue /></SelectTrigger>
                        <SelectContent> <SelectItem value="year">Year</SelectItem> <SelectItem value="month">Month</SelectItem> <SelectItem value="day">Day</SelectItem> </SelectContent></Select></div>
                    <div className="col-span-2"> <Label className="text-sm">Gender</Label>
                      <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)} disabled={isExistingPatient} ><SelectTrigger className={`h-8 ${isExistingPatient ? "bg-blue-100 border-blue-300" : ""}`}><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
                    <div className="col-span-12"> <Label className="text-sm">Address</Label>
                      <Input {...register("address")} className={`h-8 ${isExistingPatient ? "bg-blue-100 border-blue-300" : ""}`} placeholder="123 Main St, City" readOnly={isExistingPatient} /></div>
                </div>
            </div>

            {/* 2. Service Tabs */}
            <div className="flex space-x-2 mb-4 border-b border-gray-300">
                <Button type="button" onClick={() => setActiveTab('Pathology')} className={cn("py-2 px-6 rounded-t-lg font-semibold transition-colors duration-200", activeTab === 'Pathology' ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700")}><FlaskConical className="mr-2 h-5 w-5" /> Pathology/Lab</Button>
                <Button type="button" onClick={() => setActiveTab('Xray')} className={cn("py-2 px-6 rounded-t-lg font-semibold transition-colors duration-200", activeTab === 'Xray' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700")}><Stethoscope className="mr-2 h-5 w-5" /> X-ray</Button>
            </div>

            {/* 3. Active Service Form */}
            <div className="min-h-[400px]">
                {activeTab === 'Pathology' && (
                    <PathologyRegistration
                        patientData={patientData as any} 
                        isExistingPatient={isExistingPatient} doctorList={doctorList} bloodRows={bloodRows} packageRows={packageRows}
                        pathologyData={pathologyData} setPathologyData={setPathologyData}
                        commonRegDetails={commonRegDetails} setCommonRegDetails={handleUpdateRHF}
                        opdRecords={opdRecords} ipdRecords={ipdRecords} showSourceSelection={showSourceSelection} setShowSourceSelection={setShowSourceSelection} fetchSourceRecords={fetchSourceRecords}
                    />
                )}
                {activeTab === 'Xray' && (
                    <XrayRegistration
                        patientData={patientData as any} 
                        isExistingPatient={isExistingPatient} doctorList={doctorList} 
                        xrayData={xrayData} setXrayData={setXrayData}
                        commonRegDetails={commonRegDetails} setCommonRegDetails={handleUpdateRHF}
                        opdRecords={opdRecords} ipdRecords={ipdRecords} showSourceSelection={showSourceSelection} setShowSourceSelection={setShowSourceSelection} fetchSourceRecords={fetchSourceRecords}
                    />
                )}
            </div>
            
          </CardContent>
        </Card>
      </div>
    </div>
  )
}