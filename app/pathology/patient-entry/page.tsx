"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useForm } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { UserCircle, Phone, FlaskConical, Stethoscope, UserPlus, X, Hospital, Save, User, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useUserRole } from "@/hooks/useUserRole"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Table } from "@/components/ui/table"
import { saveHospitalToDB, getHospitalFromDB } from "@/lib/hospitalStorage"

import PathologyRegistration from "./PathologyRegistration"
import XrayRegistration from "./XrayRegistration"
import OPDRegistration from "./OPDRegistration"

// --- Helpers and Constants ---
const TABLE = {
  PATIENT: "patient_detail",
  DOCTOR: "zdoctorlist", // NOTE: This is partially deprecated, using config_data for OPD fees
  CONFIG: "config_data", // 🟢 NEW: Config table
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
// Helper to get exact real-time date and time dynamically
const getCurrentDateTime = () => {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const h12 = now.getHours() % 12 || 12
  const mer = now.getHours() >= 12 ? "PM" : "AM"
  const time = `${String(h12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${mer}`
  return { date, time }
}

// Helper to calculate DOB
function calculateDOB(age: number, unit: 'year' | 'month' | 'day'): string {
  const today = new Date(); const dob = new Date(today);
  dob.setHours(0, 0, 0, 0);
  if (unit === 'year') { dob.setFullYear(dob.getFullYear() - age); }
  else if (unit === 'month') { dob.setMonth(dob.getMonth() - age); }
  else if (unit === 'day') { dob.setDate(dob.getDate() - age); }
  return dob.toISOString().split('T')[0];
}

// --- Types ---

interface DoctorFee { // Doctor type with fees
  id: number;
  doctor_name: string;
  first_visit_fee: number;
  follow_up_fee: number;
}
interface BloodTestRow { id: number; test_name: string; price: number; outsource: boolean; estimated_time_mm: string | null; type?: string; }
interface PackageType { id: number; package_name: string; tests: any[]; discountamount: number; }
interface PatientSuggestion { id: number; name: string; number: number; uhid: string; title?: string; age: number; age_unit: "year" | "month" | "day"; gender: string; address?: string; }
interface OpdRegistration { opd_id: number; date: string; refer_by: string; }
interface IpdRegistration { ipd_id: number; admission_date: string; admission_time: string; under_care_of_doctor: string; bed_id: number; discharge_date: string | null; bed_management: { bed_number: string | null; room_type: string | null; } | null; }

export type VisitType = "direct" | "opd" | "ipd";
export type TpaType = boolean;
export type ActiveTab = 'OPD' | 'Pathology' | 'Xray';

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
interface OPDData {
  treatingDoctorId: number | null;
  referringDoctorName: string;
  visitCategory: 'First Visit' | 'Follow Up';
  bp: string;
  pulse: number | null;
  weight: number | null;
  spo2: string;
  sugar: string;
  discountAmount: number;
  paymentEntries: any[];
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
  uhid: string; // Will hold the permanent UHID after selection/registration

  // Registration Details (Managed by Parent RHF, synced by active child)
  hospitalName: string;
  visitType: VisitType;
  doctorName: string; // Holds the name of the doctor currently associated with the service (Treating/Referring)
  tpa: TpaType;
  registrationDate: string;
  registrationTime: string;
  sendWhatsApp: boolean;
  sourceOpdId: number | null;
  sourceIpdId: number | null;

  // Nested Service Data (Managed by Child State/RHF)
  pathology: PathologyData;
  xray: XrayData;
  opd: OPDData;
}

const getDefaultUnifiedFormValues = (): IUnifiedFormInput => {
  let savedHospital = "Cigma Clinic";
  if (typeof window !== "undefined") {
    savedHospital = localStorage.getItem("selectedHospital") || "Cigma Clinic";
  }

  // Get the exact time at the moment this function is called
  const { date, time } = getCurrentDateTime();

  return {
    title: "", name: "", contact: "", age: 0, dayType: "year", gender: "", address: "", uhid: "",
    hospitalName: savedHospital, visitType: "direct", doctorName: "", tpa: false,
    registrationDate: date, registrationTime: time, sendWhatsApp: true, // <-- Updated here
    sourceOpdId: null, sourceIpdId: null,
    pathology: { estimatedTime: "1100", bloodTests: [], discountAmount: 0, paymentEntries: [] },
    xray: { billNumber: "", remark: "", dateOfAppointment: new Date(), xrayTests: [{ examination: "", amount: 0 }], discount: 0, payments: [] },
    opd: { treatingDoctorId: null, referringDoctorName: "", visitCategory: 'First Visit', bp: "", pulse: null, weight: null, spo2: "", sugar: "", discountAmount: 0, paymentEntries: [] },
  }
}

const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => { return fn() }

// --- Main Component ---

export default function UnifiedPatientEntry() {
  const router = useRouter()
  const { role } = useUserRole()
  const [activeTab, setActiveTab] = useState<ActiveTab>('OPD');
  const [doctorList, setDoctorList] = useState<DoctorFee[]>([]) // DoctorList now holds fee data
  const [bloodRows, setBloodRows] = useState<BloodTestRow[]>([])
  const [packageRows, setPackageRows] = useState<PackageType[]>([])
  const [patientHints, setPatientHints] = useState<PatientSuggestion[]>([])
  const [showPatientHints, setShowPatientHints] = useState(false)
  const [opdRecords, setOpdRecords] = useState<OpdRegistration[]>([])
  const [ipdRecords, setIpdRecords] = useState<IpdRegistration[]>([])
  const [showSourceSelection, setShowSourceSelection] = useState(false)
  const [canRegisterNew, setCanRegisterNew] = useState(false)

  // --- Global Search State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"name" | "phone" | "uhid">("name");
  const [searchResults, setSearchResults] = useState<PatientSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);

  // --- RHF Setup for Unified Patient Data ---
  const {
    register,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<IUnifiedFormInput>({
    defaultValues: getDefaultUnifiedFormValues(),
  })

  // Local state to manage the service-specific parts
  const [pathologyData, setPathologyData] = useState<IUnifiedFormInput['pathology']>(getDefaultUnifiedFormValues().pathology);
  const [xrayData, setXrayData] = useState<IUnifiedFormInput['xray']>(getDefaultUnifiedFormValues().xray);
  const [opdData, setOpdData] = useState<IUnifiedFormInput['opd']>(getDefaultUnifiedFormValues().opd);

  const currentUhId = watch("uhid");
  const isPatientSelectedOrRegistered = Boolean(currentUhId);
  const patientHintsRef = useRef<HTMLDivElement | null>(null)
  const sourceSelectionRef = useRef<HTMLDivElement | null>(null)

  // Target specific inputs to watch instead of the whole form object to avoid redundant renders
  const [
    watchUhid, watchName, watchContact, watchAge, watchDayType, watchTitle, watchAddress, watchGender,
    watchHospitalName, watchVisitType, watchDoctorName, watchTpa, watchRegistrationDate, watchRegistrationTime,
    watchSendWhatsApp, watchSourceOpdId, watchSourceIpdId
  ] = watch([
    "uhid", "name", "contact", "age", "dayType", "title", "address", "gender",
    "hospitalName", "visitType", "doctorName", "tpa", "registrationDate", "registrationTime",
    "sendWhatsApp", "sourceOpdId", "sourceIpdId"
  ]);

  // Patient Data Object to pass down
  const patientData = useMemo(() => ({
    uhid: watchUhid, name: watchName, contact: watchContact, age: watchAge,
    dayType: watchDayType, title: watchTitle, address: watchAddress, gender: watchGender,
  }), [watchUhid, watchName, watchContact, watchAge, watchDayType, watchTitle, watchAddress, watchGender]);

  // Registration Data Object to pass down
  const commonRegDetails = useMemo(() => ({
    hospitalName: watchHospitalName, visitType: watchVisitType, doctorName: watchDoctorName, tpa: watchTpa,
    registrationDate: watchRegistrationDate, registrationTime: watchRegistrationTime, sendWhatsApp: watchSendWhatsApp,
    sourceOpdId: watchSourceOpdId, sourceIpdId: watchSourceIpdId
  }), [watchHospitalName, watchVisitType, watchDoctorName, watchTpa, watchRegistrationDate, watchRegistrationTime, watchSendWhatsApp, watchSourceOpdId, watchSourceIpdId]);

  // Function to update the RHF fields from the child component
  const handleUpdateRHF = useCallback((key: keyof IUnifiedFormInput, value: any) => {
    if (key in getDefaultUnifiedFormValues()) {
      setValue(key, value);
      if (key === "hospitalName" && value) {
        saveHospitalToDB(value);
      }
    }
  }, [setValue]);
// --- Auto-Refresh Date/Time ---
  // Keeps the registration time accurate if the browser sits idle
  // --- Auto-Refresh Date/Time ---
  // Keeps the registration time accurate and fixes Next.js Server-Side Rendering stale time
  useEffect(() => {
    const updateTimeToNow = () => {
      // Only auto-update the time if the form is empty (no patient selected/typed yet)
      if (!isPatientSelectedOrRegistered && !watchName && !watchContact) {
        const { date, time } = getCurrentDateTime();
        setValue("registrationDate", date);
        setValue("registrationTime", time);
      }
    };

    // 1. Run IMMEDIATELY as soon as the browser loads the component
    updateTimeToNow();

    // 2. Keep updating every 30 seconds just in case the user leaves the tab open and idle
    const interval = setInterval(updateTimeToNow, 30000); 

    return () => clearInterval(interval);
  }, [isPatientSelectedOrRegistered, watchName, watchContact, setValue]);
  // --- Handle Form Reset After Successful Submission (Reset Service Data ONLY) ---
  const handleSuccessfulSubmission = useCallback(() => {
    const currentHospital = getValues("hospitalName") || (typeof window !== "undefined" ? localStorage.getItem("selectedHospital") : null) || "Cigma Clinic";
    // Reset service-specific data to default but keep patient/registration data
    const defaultValues = getDefaultUnifiedFormValues();

    // 2. Reset local state for service-specific data
    setPathologyData(defaultValues.pathology);
    setXrayData(defaultValues.xray);
    setOpdData(defaultValues.opd);

    // 3. Clear service-specific RHF fields (like source IDs, but preserve patient/doctor/visit type/hospital)
    setValue("sourceOpdId", null);
    setValue("sourceIpdId", null);
    setValue("hospitalName", currentHospital);

    // 4. Close any popovers
    setShowSourceSelection(false);
    setShowPatientHints(false);
    setCanRegisterNew(false);

    // 5. Alert user they can submit another service for the same patient
    alert(`Service submitted successfully. You can now process the next service for patient UHID: ${currentUhId}`);

  }, [setValue, currentUhId, getValues]);


  // --- New User Button Logic ---
  useEffect(() => {
    const isReadyForNewRegistration = (
      !isPatientSelectedOrRegistered && // UHID is currently empty
      (!showPatientHints || patientHints.length === 0) && // Hints are not visible OR no hints found
      (patientData.name || "").trim().length > 1 &&
      (patientData.contact || "").length === 10 &&
      patientData.age > 0 &&
      (patientData.title || "").length > 0 &&
      (patientData.gender || "").length > 0
    );

    setCanRegisterNew(isReadyForNewRegistration);

  }, [patientData, isPatientSelectedOrRegistered, showPatientHints, patientHints.length]);

  const handleRegisterNewUser = useCallback(async () => {
    if (!canRegisterNew) return;

    const pData = getValues();
    const dob = calculateDOB(pData.age, pData.dayType);
    const totalDay = pData.age * (pData.dayType === "year" ? 360 : pData.dayType === "month" ? 30 : 1);

    const patientPayload = {
      name: pData.name.toUpperCase(),
      number: Number(pData.contact),
      age: pData.age,
      age_unit: pData.dayType,
      total_day: totalDay,
      gender: pData.gender,
      address: pData.address || "",
      title: pData.title,
      dob: dob,
      // **IMPORTANT:** Do NOT include uhid here. Supabase generates it.
    };

    try {
      const { data: newP, error: newPErr } = await withRetry(async () =>
        supabase.from(TABLE.PATIENT).insert(patientPayload).select("uhid").single()
      );

      if (newPErr) throw newPErr;
      const newUHID = newP?.uhid;

      if (!newUHID) throw new Error("Database failed to assign UHID.");

      // Success: Update the form with the permanent UHID
      setValue("uhid", newUHID, { shouldValidate: true, shouldDirty: true });
      setCanRegisterNew(false); // Hide the button
      setShowPatientHints(false);
      setPatientHints([]);

      alert(`New Patient Registered! UHID: ${newUHID}. Proceed to Registration.`);

      // Ensure other fields are treated as locked/selected
      setValue("doctorName", "");

    } catch (error: any) {
      console.error("Error registering new patient:", error);
      alert(error.message || "Failed to register new patient. Check console for details.");
    }
  }, [canRegisterNew, getValues, setValue]);

  const handleGlobalSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    setIsSearching(true);
    try {
      let query = supabase.from(TABLE.PATIENT).select("id:patient_id, name, number, uhid, title, age, age_unit, gender, address");
      
      const cleanQuery = searchQuery.trim();
      if (searchType === "name") {
        query = query.ilike("name", `%${cleanQuery}%`);
      } else if (searchType === "phone") {
        // For bigint 'number' column, use exact match if query is numeric
        if (/^\d+$/.test(cleanQuery)) {
          query = query.eq("number", cleanQuery);
        } else {
          setSearchResults([]);
          setShowSearchResults(true);
          setIsSearching(false);
          return;
        }
      } else if (searchType === "uhid") {
        query = query.ilike("uhid", `%${cleanQuery}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      setSearchResults(data || []);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Search error:", error);
      alert("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchType]);


  // --- Initial Data Fetching ---
  useEffect(() => {
    if (role === 'xray') { router.replace('/x-rayDashboard'); return; }

    const fetchLists = async () => {
      try {
        // 🟢 UPDATED: Fetch doctor fees from config_data
        const { data: doctorConfig, error: dcErr } = await supabase.from(TABLE.CONFIG)
          .select('data')
          .eq('data_heading', 'opd_doctor_data')
          .single();

        if (dcErr) {
          // Throwing error for production environment might be too harsh, log and use empty array instead.
          console.warn("Error fetching doctor config, using fallback data:", dcErr);
          setDoctorList([]);
        } else {
          setDoctorList((doctorConfig?.data as DoctorFee[]) ?? []);
        }

        const { data: bloods, error: bErr } = await supabase.from(TABLE.BLOOD).select("id, test_name, price, outsource, estimated_time_mm, type").order("test_name")
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
    const titleValue = watchTitle
    const male = new Set(["MR", "MAST", "BABA"])
    const female = new Set(["MS", "MISS", "MRS", "BABY", "SMT"])
    const none = new Set(["BABY OF", "DR", "", "."])
    if (male.has(titleValue)) setValue("gender", "male")
    else if (female.has(titleValue)) setValue("gender", "female")
    else if (none.has(titleValue)) setValue("gender", "")
  }, [watchTitle, setValue])

  // --- Initial Load of Saved Hospital from IndexedDB ---
  useEffect(() => {
    let isMounted = true;
    getHospitalFromDB().then((savedHospital) => {
      if (isMounted && savedHospital) {
        setValue("hospitalName", savedHospital);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [setValue]);

  // --- Persistence for Hospital Name in IndexedDB ---
  useEffect(() => {
    const hospital = watchHospitalName;
    if (hospital) {
      saveHospitalToDB(hospital);
    }
  }, [watchHospitalName]);

  // --- Click Outside Handler for Hints and Popover ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node

      // 1. Patient Hints
      if (patientHintsRef.current && !patientHintsRef.current.contains(target)) {
        setShowPatientHints(false)
      }

      // 2. Source Selection Popover Overlay (CRITICAL FIX)
      if (sourceSelectionRef.current && !sourceSelectionRef.current.contains(target) && showSourceSelection) {
        const isSelectTrigger = (target as HTMLElement).closest('.SelectTrigger');
        if (!isSelectTrigger) {
          setShowSourceSelection(false);
        }
      }

      // 3. Global Search Results
      if (searchResultsRef.current && !searchResultsRef.current.contains(target)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showSourceSelection])

  // --- Patient Search/Hints logic (Name/Contact) ---
  useEffect(() => {
    const searchString = ((watchName || "").trim() || (watchContact || "").trim())
    // Prevent search/hints if patient is already selected
    if (isPatientSelectedOrRegistered || !searchString || searchString.length < 2) {
      setPatientHints([]);
      return;
    }

    const timer = setTimeout(async () => {
      let query = supabase.from(TABLE.PATIENT).select("id:patient_id, name, number, uhid, title, age, age_unit, gender, address").limit(10);
      if ((watchName || "").trim().length >= 2) {
        query = query.ilike("name", `${watchName.trim()}%`);
      } else if ((watchContact || "").trim().length >= 2) {
        const contactVal = watchContact.trim();
        if (/^\d+$/.test(contactVal)) {
          query = query.eq("number", contactVal);
        } else {
          setPatientHints([]);
          return;
        }
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
  }, [watchName, watchContact, isPatientSelectedOrRegistered]);


  // --- Patient Selection/Handling ---
  async function handlePatientSelect(p: PatientSuggestion) {
    setValue("name", p.name); setValue("contact", p.number.toString()); setValue("age", p.age);
    setValue("dayType", p.age_unit); setValue("gender", p.gender); setValue("title", p.title || "");
    setValue("address", p.address || "");
    setValue("uhid", p.uhid);

    setValue("visitType", "direct"); setValue("sourceOpdId", null); setValue("sourceIpdId", null);
    setShowPatientHints(false);
    setCanRegisterNew(false);

    // Fetch last doctor name
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
    const currentHospital = getValues("hospitalName") || (typeof window !== "undefined" ? localStorage.getItem("selectedHospital") : null) || "Cigma Clinic";
    reset({
      ...getDefaultUnifiedFormValues(),
      hospitalName: currentHospital,
    });
    setPathologyData(getDefaultUnifiedFormValues().pathology);
    setXrayData(getDefaultUnifiedFormValues().xray);
    setOpdData(getDefaultUnifiedFormValues().opd);
    setShowSourceSelection(false);
    setCanRegisterNew(false); // Reset new registration flag
    setShowPatientHints(false);
    setPatientHints([]);
  }

  // --- Source Selection Popover Component (Omitted for brevity) ---
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
          <Table className="min-w-full">
            <thead>
              <tr><th>ID</th><th>{isOpd ? "Date/Time" : "Admission Date"}</th><th>{isOpd ? "Referred By" : "Doctor / Room Info"}</th>{!isOpd && <th>Status</th>}<th>Select</th></tr>
            </thead>
            <tbody>
              {isOpd
                ? (records as OpdRegistration[]).map((r) => (
                  <tr
                    key={r.opd_id}
                    className={`cursor-pointer transition-colors hover:bg-blue-100 ${r.opd_id === selectedId ? 'bg-blue-50' : ''}`}
                    onClick={() => handleSelect(r.opd_id, r.refer_by)}
                  >
                    <td>{r.opd_id}</td><td>{formatDate(r.date)}</td><td>{r.refer_by}</td>
                    <td><Checkbox checked={r.opd_id === selectedId} onCheckedChange={() => handleSelect(r.opd_id, r.refer_by)} /></td></tr>
                ))
                : (records as IpdRegistration[]).map((r) => {
                  const status = r.discharge_date ? 'Discharged' : 'Active';
                  return (<tr
                    key={r.ipd_id}
                    className={`cursor-pointer transition-colors hover:bg-blue-100 ${r.ipd_id === selectedId ? 'bg-blue-50' : ''}`}
                    onClick={() => handleSelect(r.ipd_id, r.under_care_of_doctor)}
                  >
                    <td>{r.ipd_id}</td><td>{formatDate(r.admission_date)}</td><td>{r.under_care_of_doctor}</td>
                    <td>{status}</td><td><Checkbox checked={r.ipd_id === selectedId} onCheckedChange={() => handleSelect(r.ipd_id, r.under_care_of_doctor)} /></td></tr>);
                })}
            </tbody>
          </Table>
        </div>
        <div className="mt-4 text-right"><Button type="button" onClick={() => setShowSourceSelection(false)} disabled={!selectedId} className="bg-blue-600 hover:bg-blue-700">Confirm Selection</Button></div>
      </div>
    );
  };


  if (role === 'xray') { return null; }

  const isPatientDataLocked = isPatientSelectedOrRegistered;

  async function fetchSourceRecords(uhid: string, visitTypeFilter: "opd" | "ipd", autoOpen: boolean) {
    if (!uhid) return;
    try {
      if (visitTypeFilter === 'opd') {
        const { data: opds } = await supabase.from(TABLE.OPD_REGISTRATION)
          .select("opd_id:id, date:created_at, refer_by:referring_doctor_name")
          .eq("uhid", uhid)
          .order("created_at", { ascending: false })
          .limit(5);
        if (opds) setOpdRecords(opds as any);
      } else {
        const { data: ipds } = await supabase.from(TABLE.IPD_REGISTRATION)
          .select("ipd_id:id, admission_date, admission_time, under_care_of_doctor, bed_id, discharge_date, bed_management(bed_number, room_type)")
          .eq("uhid", uhid)
          .order("admission_date", { ascending: false })
          .limit(5);
        if (ipds) setIpdRecords(ipds as any);
      }

      if (autoOpen) setShowSourceSelection(true);

    } catch (e) {
      console.error("Error fetching source records", e);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 relative">
      {/* 🛑 CRITICAL FIX: The overlay must be the first element, using a high Z-index (z-40) */}
      {showSourceSelection && (<div
        className="absolute inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center"
      >
        <SourceSelectionPopover />
      </div>)}

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <UserPlus className="mr-2 w-6 h-6 text-indigo-600" />
            Unified Patient Entry
          </h1>
        </div>

        {/* --- Global Search Section --- */}
        <Card className="border-none shadow-sm bg-white overflow-visible">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="w-full md:w-48">
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block">Search By</Label>
                <Select value={searchType} onValueChange={(v) => setSearchType(v as any)}>
                  <SelectTrigger className="h-10 bg-gray-50 border-gray-200">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Patient Name</SelectItem>
                    <SelectItem value="phone">Phone Number</SelectItem>
                    <SelectItem value="uhid">UHID Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 w-full relative" ref={searchResultsRef}>
                <Label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  Search Existing Patient
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
                      placeholder={
                        searchType === "name" ? "Enter patient name..." :
                        searchType === "phone" ? "Enter 10-digit number..." :
                        "Enter UHID (e.g., PAT-123)..."
                      }
                      className="h-10 pl-10 bg-gray-50 border-gray-200 focus:bg-white transition-all"
                    />
                  </div>
                  <Button 
                    onClick={handleGlobalSearch} 
                    disabled={isSearching}
                    className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white px-6 font-medium shadow-sm transition-all"
                  >
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>

                {/* Global Search Results Dropdown */}
                {showSearchResults && (
                  <div className="absolute z-[60] w-full bg-white border border-gray-200 mt-2 rounded-xl shadow-2xl overflow-hidden max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-500 px-2 uppercase tracking-wider">
                        {searchResults.length} {searchResults.length === 1 ? 'Result' : 'Results'} Found
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setShowSearchResults(false)} className="h-6 w-6 p-0 hover:bg-gray-200 rounded-full">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {searchResults.length === 0 ? (
                      <div className="p-8 text-center">
                        <User className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No patients found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-400 mt-1">Try a different search term or register as new</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              handlePatientSelect(p);
                              setShowSearchResults(false);
                              setSearchQuery("");
                            }}
                            className="p-3 hover:bg-indigo-50 cursor-pointer transition-colors group flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                                {p.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">
                                  {p.name}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                  <span className="font-semibold text-indigo-600">{p.uhid}</span>
                                  <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                                  <span>{p.number}</span>
                                  <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                                  <span>{p.age} {p.age_unit}s • {p.gender}</span>
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 bg-white shadow-sm border border-indigo-100 text-indigo-600 text-xs font-bold px-3">
                              Select
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border border-gray-200 overflow-hidden bg-white">
          <CardContent className="p-0">
            {/* 1. Patient Information Card (Common to all services) */}
            <div className="p-6 bg-white">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-blue-800">Patient Details</h2>
                <div className="flex items-center gap-2">
                  {isPatientDataLocked && (
                    <span className={cn("text-sm font-medium text-blue-600")}>
                      Selected Patient (UHID: {watch("uhid")})
                    </span>
                  )}
                  {canRegisterNew && (
                    <Button type="button" variant="secondary" size="sm" onClick={handleRegisterNewUser} className="h-7 px-2 py-0 text-xs bg-purple-500 hover:bg-purple-600 text-white">
                      <Save className="h-3 w-3 mr-1" /> Register & Select New Patient
                    </Button>
                  )}
                  {isPatientDataLocked && (
                    <Button type="button" variant="outline" size="sm" onClick={handleNewPatient} className="h-7 px-2 py-0 text-xs">Clear & Add New</Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2 mb-3">
                <div className="col-span-1"> <Label className="text-sm">Title</Label>
                  <Select value={watch("title")} onValueChange={(v) => setValue("title", v)} disabled={isPatientDataLocked} ><SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{[".", "MR", "MRS", "MAST", "BABA", "MISS", "MS", "BABY", "SMT", "BABY OF", "DR"].map((t) => (<SelectItem key={t} value={t}>{t === "." ? "NoTitle" : t}</SelectItem>))}</SelectContent></Select></div>
                <div className="col-span-4 relative" ref={patientHintsRef}> <Label className="text-sm">Full Name</Label>
                  <div className="relative"><Input {...register("name", { required: "Name is required", onChange: (e) => { if (!isPatientDataLocked) { setShowPatientHints(true); setValue("name", e.target.value.toUpperCase()); setValue("uhid", ""); } }, })} className={`h-8 pl-10 ${isPatientDataLocked ? "bg-blue-100 border-blue-300" : ""}`} placeholder="Type at least 2 letters..." onFocus={() => setShowPatientHints(true)} readOnly={isPatientDataLocked} /><UserCircle className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" /></div>
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                  {showPatientHints && patientHints.length > 0 && (<ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto text-sm shadow-lg">
                    {patientHints.map((p) => (<li key={p.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0" onClick={() => handlePatientSelect(p)} >
                      <div className="font-medium text-gray-900"><span className="text-blue-600 font-bold mr-2">UHID: {p.uhid}</span> {p.name}</div>
                      <div className="text-xs text-gray-500">{p.number} • {p.age}{p.age_unit.charAt(0).toUpperCase()} • {p.gender}</div></li>))}
                  </ul>)}</div>
                <div className="col-span-3"> <Label className="text-sm">Contact Number</Label>
                  <div className="relative"><Input {...register("contact", { required: "Phone number is required", pattern: { value: /^[0-9]{10}$/, message: "Phone number must be 10 digits" }, onChange: () => setShowPatientHints(true) })} className={`h-8 pl-10 ${isPatientDataLocked ? "bg-blue-100 border-blue-300" : ""}`} placeholder="Enter 10-digit mobile number" onFocus={() => setShowPatientHints(true)} readOnly={isPatientDataLocked} /><Phone className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" /></div>
                  {errors.contact && <p className="text-red-500 text-xs mt-1">{errors.contact.message}</p>}</div>
                <div className="col-span-1"> <Label className="text-sm">Age</Label>
                  <Input type="number" {...register("age", { required: "Age is required", min: { value: 0, message: "Age must be positive" }, valueAsNumber: true })} className={`h-8 ${isPatientDataLocked ? "bg-blue-100 border-blue-300" : ""}`} readOnly={isPatientDataLocked} />
                  {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}</div>
                <div className="col-span-1"> <Label className="text-sm">Unit</Label>
                  <Select value={watch("dayType")} onValueChange={(v) => setValue("dayType", v as any)} disabled={isPatientDataLocked} ><SelectTrigger className={`h-8 ${isPatientDataLocked ? "bg-blue-100 border-blue-300" : ""}`}><SelectValue /></SelectTrigger>
                    <SelectContent> <SelectItem value="year">Year</SelectItem> <SelectItem value="month">Month</SelectItem> <SelectItem value="day">Day</SelectItem> </SelectContent></Select></div>
                <div className="col-span-2"> <Label className="text-sm">Gender</Label>
                  <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)} disabled={isPatientDataLocked} ><SelectTrigger className={`h-8 ${isPatientDataLocked ? "bg-blue-100 border-blue-300" : ""}`}><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
                <div className="col-span-12"> <Label className="text-sm">Address</Label>
                  <Input {...register("address")} className={`h-8 ${isPatientDataLocked ? "bg-blue-100 border-blue-300" : ""}`} placeholder="123 Main St, City" readOnly={isPatientDataLocked} /></div>
              </div>
            </div>

            {/* 2. Service Tabs */}
            <div className="flex space-x-2 mb-4 border-b border-gray-300">
              <Button type="button" onClick={() => setActiveTab('OPD')} className={cn("py-2 px-6 rounded-t-lg font-semibold transition-colors duration-200", activeTab === 'OPD' ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700")}><User className="mr-2 h-5 w-5" /> OPD Consultation</Button>
              <Button type="button" onClick={() => setActiveTab('Pathology')} className={cn("py-2 px-6 rounded-t-lg font-semibold transition-colors duration-200", activeTab === 'Pathology' ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700")}><FlaskConical className="mr-2 h-5 w-5" /> Pathology/Lab</Button>
              {/* <Button type="button" onClick={() => setActiveTab('Xray')} className={cn("py-2 px-6 rounded-t-lg font-semibold transition-colors duration-200", activeTab === 'Xray' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700")}><Stethoscope className="mr-2 h-5 w-5" /> X-ray</Button> */}
            </div>

            {/* 3. Active Service Form */}
            <div className="min-h-[400px]">
              {activeTab === 'OPD' && (
                <OPDRegistration
                  patientData={patientData as any}
                  isExistingPatient={isPatientDataLocked}
                  doctorList={doctorList}
                  opdData={opdData} setOpdData={setOpdData}
                  commonRegDetails={commonRegDetails} setCommonRegDetails={handleUpdateRHF}
                  onSuccess={handleSuccessfulSubmission}
                />
              )}
              {activeTab === 'Pathology' && (
                <PathologyRegistration
                  patientData={patientData as any}
                  isExistingPatient={isPatientDataLocked}
                  doctorList={doctorList} bloodRows={bloodRows} packageRows={packageRows}
                  pathologyData={pathologyData} setPathologyData={setPathologyData}
                  commonRegDetails={commonRegDetails} setCommonRegDetails={handleUpdateRHF}
                  opdRecords={opdRecords} ipdRecords={ipdRecords} showSourceSelection={showSourceSelection} setShowSourceSelection={setShowSourceSelection} fetchSourceRecords={fetchSourceRecords}
                  onSuccess={handleSuccessfulSubmission}
                />
              )}
              {activeTab === 'Xray' && (
                <XrayRegistration
                  patientData={patientData as any}
                  isExistingPatient={isPatientDataLocked}
                  doctorList={doctorList}
                  xrayData={xrayData} setXrayData={setXrayData}
                  commonRegDetails={commonRegDetails} setCommonRegDetails={handleUpdateRHF}
                  opdRecords={opdRecords} ipdRecords={ipdRecords} showSourceSelection={showSourceSelection} setShowSourceSelection={setShowSourceSelection} fetchSourceRecords={fetchSourceRecords}
                  onSuccess={handleSuccessfulSubmission}
                />
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  )
}