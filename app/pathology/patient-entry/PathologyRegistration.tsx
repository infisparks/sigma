// app/pathology/patient-entry/PathologyRegistration.tsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar, Clock, Plus, X, Search, Trash2, Timer, FlaskConical } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

// Import types from the parent file
import type { IUnifiedFormInput, VisitType, TpaType } from "./page"

// --- Helpers and Constants ---
const TABLE = { PATIENT: "patient_detail", REGISTRATION: "zregistration", DOCTOR: "zdoctorlist", BLOOD: "zblood_test" } as const;

// Minimal type definitions required for this component
interface PatientData { uhid: string; name: string; contact: string; age: number; dayType: "year" | "month" | "day"; title: string; address?: string; gender: string; }
interface CommonRegDetails { hospitalName: string; visitType: VisitType; doctorName: string; tpa: TpaType; registrationDate: string; registrationTime: string; sendWhatsApp: boolean; sourceOpdId: number | null; sourceIpdId: number | null; }
interface PathologyData { estimatedTime: string; bloodTests: any[]; discountAmount: number; paymentEntries: any[]; }
interface PackageType { id: number; package_name: string; tests: any[]; discountamount: number; }

// Combined RHF interface for this component (FIXED)
interface PathRegFormFields extends CommonRegDetails, PathologyData {}

// Helper implementation placeholders
function throwIfError(error: any) { if (error) throw error; }
function time12ToISO(date: string, time12: string): string {
  const [time, mer] = time12.split(" ");
  let [hh, mm] = time.split(":").map(Number);
  if (mer === "PM" && hh < 12) hh += 12;
  if (mer === "AM" && hh === 12) hh = 0;
  return new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString();
}
function calculateDOB(age: number, unit: 'year' | 'month' | 'day'): string {
    const today = new Date(); const dob = new Date(today);
    dob.setHours(0, 0, 0, 0); 
    if (unit === 'year') { dob.setFullYear(dob.getFullYear() - age); } 
    else if (unit === 'month') { dob.setMonth(dob.getMonth() - age); } 
    else if (unit === 'day') { dob.setDate(dob.getDate() - age); }
    return dob.toISOString().split('T')[0];
}

// FIX: Corrected implementation for minutes to Day/Hour/Minute conversion
function formatMinutesToDuration(totalMinutes: number): string {
    if (totalMinutes < 0 || isNaN(totalMinutes) || totalMinutes === 0) return "Less than 1 Minute";

    const MIN_PER_HOUR = 60;
    const MIN_PER_DAY = 24 * MIN_PER_HOUR;

    const days = Math.floor(totalMinutes / MIN_PER_DAY);
    let remainingMinutes = totalMinutes % MIN_PER_DAY;
    const hours = Math.floor(remainingMinutes / MIN_PER_HOUR);
    const minutes = remainingMinutes % MIN_PER_HOUR;

    let result = [];
    if (days > 0) result.push(`${days} Day${days > 1 ? 's' : ''}`);
    if (hours > 0) result.push(`${hours} Hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) result.push(`${minutes} Minute${minutes > 1 ? 's' : ''}`);
    
    return result.join(" ");
}

// FIX: Corrected time calculation logic using estimated_time_mm
function calculateMaxEstimatedTime(tests: any[], bloodRows: any[]): number {
    if (tests.length === 0) return 0;
    let maxTime = 0;
    tests.forEach((selectedTest: any) => {
        // Find the full test definition using the testId from the selected test
        const testDef = bloodRows.find((row: any) => row.id === selectedTest.testId);
        // Safely parse the estimated_time_mm string from the test definition
        const timeInMinutes = parseInt((testDef as any)?.estimated_time_mm || '0', 10);
        if (!isNaN(timeInMinutes) && timeInMinutes > maxTime) { maxTime = timeInMinutes; }
    });
    return maxTime;
}

const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => { return fn() }


// --- Component ---

interface PathologyProps {
    patientData: PatientData;
    isExistingPatient: boolean;
    doctorList: any[];
    bloodRows: any[];
    packageRows: PackageType[];
    pathologyData: PathologyData;
    setPathologyData: (data: PathologyData) => void;
    commonRegDetails: CommonRegDetails;
    setCommonRegDetails: (key: keyof CommonRegDetails, value: any) => void;
    opdRecords: any[]; ipdRecords: any[];
    showSourceSelection: boolean; setShowSourceSelection: React.Dispatch<React.SetStateAction<boolean>>;
    fetchSourceRecords: (uhid: string, visitType: 'opd' | 'ipd', autoOpen: boolean) => Promise<void>;
}


const PathologyRegistration: React.FC<PathologyProps> = ({ 
    patientData, isExistingPatient, bloodRows, packageRows,
    pathologyData, setPathologyData,
    commonRegDetails, setCommonRegDetails,
    fetchSourceRecords, setShowSourceSelection,
}) => {
    
    // 1. Initialize RHF with combined data
    const defaultRHFValues: PathRegFormFields = useMemo(() => ({
        ...commonRegDetails,
        ...pathologyData,
    }), [commonRegDetails, pathologyData]);

    const { 
        control, watch, setValue, handleSubmit, 
        formState: { isSubmitting, errors },
    } = useForm<PathRegFormFields>({ defaultValues: defaultRHFValues });

    const watchFields = watch();

    // 2. Sync RHF changes back to parent state
    useEffect(() => {
        const { estimatedTime, bloodTests, discountAmount, paymentEntries, ...regDetails } = watchFields;
        
        setPathologyData({ estimatedTime, bloodTests, discountAmount, paymentEntries });

        (Object.keys(regDetails) as Array<keyof CommonRegDetails>).forEach((key) => {
             setCommonRegDetails(key, regDetails[key]); 
        });

    }, [watchFields, setPathologyData, setCommonRegDetails]);

    // 3. Field Arrays & Watchers
    const { fields: bloodTestFields, append: appendBloodTest, remove: removeBloodTest } = useFieldArray({ control, name: "bloodTests" as "bloodTests" });
    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control, name: "paymentEntries" as "paymentEntries" });

    const bloodTests = watch("bloodTests");
    const discountAmount = watch("discountAmount") || 0;
    const paymentEntries = watch("paymentEntries") || [];
    const watchEstimatedTime = watch("estimatedTime");
    const watchVisitType = watch("visitType");

    // FIXED: Calculate total amounts safely
    const totalAmount = bloodTests.reduce((s: number, t: any) => s + (t.price || 0), 0);
    const totalPaid = paymentEntries.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const remainingAmount = totalAmount - discountAmount - totalPaid;
    
    const unselectedTests = useMemo(() => bloodRows.filter((t: any) => !bloodTests.some((bt: any) => bt.testId === t.id)), [bloodRows, bloodTests]);
    const testSearchRef = useRef<HTMLDivElement | null>(null);
    const [searchText, setSearchText] = useState("");
    
    // 4. Calculation and Visit Logic (Time and Source Popover Trigger)
    useEffect(() => {
        const maxMinutes = calculateMaxEstimatedTime(bloodTests, bloodRows);
        setValue("estimatedTime", String(maxMinutes)); 
    }, [bloodTests, bloodRows, setValue]);

    useEffect(() => {
        if (patientData.uhid && (watchVisitType === 'opd' || watchVisitType === 'ipd')) {
            fetchSourceRecords(patientData.uhid, watchVisitType as 'opd' | 'ipd', true); 
        } else {
            setShowSourceSelection(false);
            if (watchVisitType === 'direct') { setValue("sourceOpdId", null); setValue("sourceIpdId", null); }
        }
    }, [patientData.uhid, watchVisitType, fetchSourceRecords, setShowSourceSelection, setValue]);

    // 5. Handlers
    const addTestById = (id: number) => {
        const t = bloodRows.find((x: any) => x.id === id);
        if (!t) return;
        appendBloodTest({ testId: t.id, testName: t.test_name, price: t.price, testType: t.outsource ? "outsource" : "inhospital" });
        setSearchText("");
    }
    const removeAllTests = () => { for (let i = bloodTestFields.length - 1; i >= 0; i--) removeBloodTest(i) }
    const addAllTests = () => { unselectedTests.forEach((t: any) => addTestById(t.id)) }
    const addPaymentEntry = () => {
        const currentTime = watch("registrationTime"); // Use current RHF time value
        appendPayment({ amount: 0, paymentMode: "online", time: currentTime });
    }

    // 6. Submission Handler
    const onSubmit: SubmitHandler<PathRegFormFields> = async (data) => {
        if (!patientData.uhid || data.bloodTests.length === 0) { alert("Please complete patient details and add at least one test."); return; }
        if ((data.visitType === 'opd' && data.sourceOpdId === null) || (data.visitType === 'ipd' && data.sourceIpdId === null)) { alert(`Please select a source ${data.visitType.toUpperCase()} registration.`); return; }

        try {
            const finalUHID: string = patientData.uhid;
            
            // 1. Patient Update 
            const dob = calculateDOB(patientData.age, patientData.dayType);
            const totalDay = patientData.age * (patientData.dayType === "year" ? 360 : patientData.dayType === "month" ? 30 : 1);
            await withRetry(async () => supabase.from(TABLE.PATIENT).update({ name: patientData.name.toUpperCase(), number: Number(patientData.contact), age: patientData.age, age_unit: patientData.dayType, total_day: totalDay, gender: patientData.gender, address: patientData.address || "", title: patientData.title, dob: dob, }).eq("uhid", finalUHID));
            
            // 2. Registration Insertion
            const isoTime = time12ToISO(data.registrationDate, data.registrationTime);
            const paymentHistoryData = { totalAmount: totalAmount, discount: data.discountAmount, paymentHistory: data.paymentEntries || [], };
            
            const { data: regData, error: regErr } = await withRetry(async () => supabase.from(TABLE.REGISTRATION).insert({
                    "UHID": finalUHID, amount_paid: totalPaid, visit_type: data.visitType.toLowerCase(), registration_time: isoTime, samplecollected_time: isoTime,
                    discount_amount: data.discountAmount, hospital_name: data.hospitalName, payment_mode: data.paymentEntries.length > 0 ? data.paymentEntries[0].paymentMode : "online",
                    bloodtest_data: data.bloodTests, amount_paid_history: paymentHistoryData, doctor_name: data.doctorName, tpa: data.tpa,
                    source_opd_id: data.visitType.toLowerCase() === 'opd' ? data.sourceOpdId : null, source_ipd_id: data.visitType.toLowerCase() === 'ipd' ? data.sourceIpdId : null,
                    estimated_time_mm: parseInt(data.estimatedTime, 10),
                }).select().single());
                
            throwIfError(regErr);
            const registrationId = regData.id;
            
            // 3. WhatsApp FIX: RESTORED WHATSAPP SENDING LOGIC
            if (data.sendWhatsApp) {
                const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || "";
                if (!apiKey) {
                  console.error("WhatsApp API Key is missing. Check NEXT_PUBLIC_WHATSAPP_API_KEY environment variable.");
                } else {
                  const bloodTestNames = data.bloodTests.map((test: any) => test.testName).join(", ") || "No blood tests booked.";
                  const formattedEstimatedTime = formatMinutesToDuration(parseInt(data.estimatedTime, 10) || 0);
                  const whatsappCaption = `Dear *${patientData.name}*,\n\nWe have received your Pathology request for: *${data.registrationDate}* at *${data.registrationTime}* \n\n*UHID (Patient ID)*: ${finalUHID}\n*Registration ID*: ${registrationId}\n*Tests Booked*: ${bloodTestNames}\n*Estimated Report Time*: ${formattedEstimatedTime}\n\n*Summary*:\n*Total Amount*: ₹${totalAmount.toFixed(2)}\n*Amount Paid*: ₹${totalPaid.toFixed(2)}\n*Remaining Balance*: ₹${remainingAmount.toFixed(2)}\n\nThank you for choosing us!`;
                  const whatsappPayload = { number: `91${patientData.contact}`, text: whatsappCaption };

                  fetch("https://evo.infispark.in/message/sendText/medfordlab", {
                    method: "POST", headers: { "Content-Type": "application/json", "apikey": apiKey }, body: JSON.stringify(whatsappPayload),
                  }).then(async (response) => {
                      if (!response.ok) {
                        const errorData = await response.json();
                        console.warn(`Failed to send WhatsApp message: ${errorData.message || 'Unknown error'}`);
                      } else {
                        console.log("WhatsApp registration message sent successfully.");
                      }
                  }).catch((whatsappError) => {
                      console.error("Error sending WhatsApp message:", whatsappError);
                  });
                }
            }

            alert(`Pathology Registration successful (ID: ${registrationId}) ✅`);
            
            // 4. Reset service-specific fields
            const defaultPathology = { estimatedTime: "1100", bloodTests: [], discountAmount: 0, paymentEntries: [] };
            setPathologyData(defaultPathology);
            setValue("estimatedTime", defaultPathology.estimatedTime);
            setValue("bloodTests", defaultPathology.bloodTests);
            setValue("discountAmount", defaultPathology.discountAmount);
            setValue("paymentEntries", defaultPathology.paymentEntries);

        } catch (err: any) {
            console.error(err);
            alert(err.message ?? "Unexpected error during Pathology submission – check console");
        }
    }


    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex items-center justify-between p-3 bg-white rounded-t-lg border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 flex items-center"><FlaskConical className="mr-2 h-6 w-6 text-indigo-600" />Pathology/Lab Services</h3>
                <Button type="submit" disabled={isSubmitting || !patientData.uhid} className="bg-indigo-600 hover:bg-indigo-700">
                    {isSubmitting ? "Submitting..." : "Submit Pathology Order"}
                </Button>
            </div>
            
            <div className="p-3 space-y-3">
                 {/* Registration Details (Inside Tab) */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-700 mb-3">Registration & Visit Details</h2>
                    <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3"><Label className="text-sm">Hospital</Label>
                        <Select value={watch("hospitalName")} onValueChange={(v) => setValue("hospitalName", v)}><SelectTrigger className={`h-8`}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</SelectItem><SelectItem value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</SelectItem><SelectItem value="Apex Clinic">Apex Clinic</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
                        <div className="col-span-4 relative"><Label className="text-sm">Doctor Name</Label>
                            <Input {...control.register("doctorName", { required: "Doctor is required" })} className="h-8" placeholder="Referring Doctor"/>
                            {errors.doctorName && <p className="text-red-500 text-xs mt-1">{errors.doctorName.message}</p>}</div>
                        <div className="col-span-2"><Label className="text-sm">Date</Label>
                            <div className="flex items-center text-sm"><Calendar className="h-4 w-4 text-gray-500 absolute left-1" />
                                <input type="date" {...control.register("registrationDate")} className="p-1 border rounded text-sm w-full h-8 pl-7" /></div></div>
                        <div className="col-span-2"><Label className="text-sm">Time</Label>
                            <div className="flex items-center text-sm"><Clock className="h-4 w-4 text-gray-500 absolute left-1" />
                                <input type="text" {...control.register("registrationTime")} className="p-1 border rounded text-sm w-full h-8 pl-7" placeholder="12:00 PM"/></div></div>
                        <div className="col-span-1"><Label className="text-sm">Visit</Label>
                        <Select value={watch("visitType")} onValueChange={(v) => setValue("visitType", v as any)} disabled={!isExistingPatient} >
                            <SelectTrigger className={`h-8 ${isExistingPatient ? "" : "bg-gray-100"}`}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="direct">Direct</SelectItem><SelectItem value="opd" disabled={!isExistingPatient}>OPD</SelectItem><SelectItem value="ipd" disabled={!isExistingPatient}>IPD</SelectItem></SelectContent></Select>
                        {(watch("sourceOpdId") !== null || watch("sourceIpdId") !== null) && (<p className="text-xs text-green-600 mt-1 font-medium">ID: {watch("sourceOpdId") ?? watch("sourceIpdId")}</p>)}</div>
                        <div className="col-span-1"><Label className="text-sm">Type</Label>
                        <Select value={watch("tpa") === true ? "Yes" : "No"} onValueChange={(v) => setValue("tpa", v === "Yes")}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Normal/TPA" /></SelectTrigger>
                            <SelectContent><SelectItem value="No">Normal</SelectItem><SelectItem value="Yes">TPA</SelectItem></SelectContent></Select></div>
                        <div className="col-span-6 mt-2"><Label className="text-sm">Report Est. Time (Pathology)</Label>
                            <div className="relative flex items-center h-8">
                                <Input type="number" {...control.register("estimatedTime", { required: "Time is required", min: { value: 0, message: "Positive" }, valueAsNumber: true, })} className="h-8 w-20 pl-7" />
                                <Timer className="h-4 w-4 absolute left-1 top-1/2 -translate-y-1/2 text-gray-400" />
                                <span className="ml-2 text-sm text-gray-600 font-medium truncate">Minutes: <span className="text-blue-600 font-bold">{formatMinutesToDuration(parseInt(watchEstimatedTime, 10) || 0)}</span></span>
                            </div>{errors.estimatedTime && <p className="text-red-500 text-xs mt-1">{errors.estimatedTime.message}</p>}</div>
                        <div className="col-span-6 mt-2 flex items-center h-8"><Checkbox checked={watch("sendWhatsApp")} onCheckedChange={(v) => setValue("sendWhatsApp", !!v)} id="patho-whatsapp-checkbox" />
                            <Label htmlFor="patho-whatsapp-checkbox" className="text-sm cursor-pointer ml-2 flex items-center gap-1"><span className="text-green-600">📱</span>Send WhatsApp SMS</Label></div>
                    </div>
                </div>
                {/* Blood Tests Section */}
                <div className="bg-white p-1 rounded-lg border">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-lg font-semibold text-gray-700">Tests Selection</h3>
                        <div className="flex items-center space-x-1">
                            <div className="flex items-center mr-2"><Label className="text-xs mr-1">Package</Label>
                                <Select value={"none"} onValueChange={(pkgId) => {
                                        if (!pkgId || pkgId === "none") return; const pkg = packageRows.find((p: any) => String(p.id) === String(pkgId)); if (pkg) { removeAllTests(); pkg.tests.forEach((t: any) => { addTestById(t.testId); }); setValue("discountAmount", pkg.discountamount || 0); }
                                    }}><SelectTrigger className="h-7 w-48"><SelectValue placeholder="Select package" /></SelectTrigger>
                                    <SelectContent><SelectItem value="none">No Package</SelectItem>{packageRows.map((pkg: any) => (<SelectItem key={pkg.id} value={String(pkg.id)}>{pkg.package_name} (₹{pkg.discountamount} OFF)</SelectItem>))}</SelectContent></Select></div>
                            <Button type="button" variant="outline" size="sm" onClick={addAllTests}> Add All </Button>
                            <Button type="button" variant="outline" size="sm" onClick={removeAllTests}> Remove All </Button>
                            <div className="relative" ref={testSearchRef}>
                                <Input type="text" placeholder="Search tests..." className="h-7 w-40" value={searchText} onChange={(e) => { setSearchText(e.target.value) }}/>
                                <Search className="h-4 w-4 absolute right-3 top-2.5 text-gray-400" />
                                {searchText.trim() && (<ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-32 overflow-y-auto text-sm shadow-lg">
                                        {unselectedTests.filter((t: any) => t.test_name.toLowerCase().includes(searchText.toLowerCase())).map((t: any) => (
                                                <li key={t.id} className="px-2 py-1 hover:bg-gray-100 cursor-pointer" onClick={() => addTestById(t.id)}>{t.test_name} - ₹{t.price}</li>))}
                                    </ul>)}
                            </div>
                        </div>
                    </div>
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50%] py-1 px-2">Test Name</TableHead>
                                    <TableHead className="w-[20%] py-1 px-2">Price (₹)</TableHead>
                                    <TableHead className="w-[20%] py-1 px-2">Type</TableHead>
                                    <TableHead className="w-[10%] py-1 px-2" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bloodTestFields.length === 0 ? (<TableRow><TableCell colSpan={4} className="text-center py-2 text-gray-500">No tests selected</TableCell></TableRow>) : (
                                    bloodTestFields.map((field, idx) => (
                                        <TableRow key={field.id}>
                                            <TableCell className="py-1 px-2">{watch(`bloodTests.${idx}.testName`)}</TableCell>
                                            <TableCell className="py-1 px-2">
                                                <Input type="number" {...control.register(`bloodTests.${idx}.price` as `bloodTests.${number}.price`, { valueAsNumber: true })} className="h-7 w-20" disabled={ (watch(`bloodTests.${idx}.testName`) || "").trim().toLowerCase() !== "histopathology" } />
                                            </TableCell>
                                            <TableCell className="py-1 px-2">
                                                <Select value={watch(`bloodTests.${idx}.testType`)} onValueChange={(v) => setValue(`bloodTests.${idx}.testType` as `bloodTests.${number}.testType`, v as any)}>
                                                    <SelectTrigger className="h-7"> <SelectValue /> </SelectTrigger>
                                                    <SelectContent><SelectItem value="inhospital">InHouse</SelectItem><SelectItem value="outsource">Outsource</SelectItem></SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="py-1 px-2">
                                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeBloodTest(idx)} ><X className="h-4 w-4 text-red-500" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                {/* Payment Section */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-semibold text-gray-700">Payment Details</h3><Button type="button" variant="outline" size="sm" onClick={addPaymentEntry}><Plus className="h-4 w-4 mr-1" /> Add Payment</Button></div>
                        <div className="mb-3"><Label className="text-sm">Discount (₹)</Label>
                            <Input type="number" step="0.01" {...control.register("discountAmount", { valueAsNumber: true })} placeholder="0" className="h-8"/></div>
                        <div className="space-y-2">
                            {paymentFields.length === 0 ? (<div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>) : (
                                paymentFields.map((field, idx) => (<div key={field.id} className="border rounded-lg p-2 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Payment {idx + 1}</span><Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePayment(idx)} ><Trash2 className="h-3 w-3 text-red-500" /></Button></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><Label className="text-xs">Amount (₹)</Label><Input type="number" step="0.01" {...control.register(`paymentEntries.${idx}.amount` as `paymentEntries.${number}.amount`, { valueAsNumber: true })} className="h-8" placeholder="0"/></div>
                                            <div><Label className="xs">Mode</Label>
                                                <Select value={watch(`paymentEntries.${idx}.paymentMode`)} onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode` as `paymentEntries.${number}.paymentMode`, v as any)} >
                                                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent></Select></div></div></div>))
                            )}
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border">
                        <h3 className="text-lg font-semibold text-gray-700">Payment Summary</h3>
                        <div className="space-y-2 mb-3">
                            <div className="flex justify-between"><span>Total Amount:</span><span className="font-medium">₹{totalAmount.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Discount:</span><span className="font-medium">₹{discountAmount.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Total Paid:</span><span className="font-medium">₹{totalPaid.toFixed(2)}</span></div>
                            <div className="flex justify-between border-t pt-2">
                                <span className="font-semibold">Remaining Amount:</span>
                                <span className={`font-semibold ${remainingAmount < 0 ? "text-red-600" : remainingAmount > 0 ? "text-orange-600" : "text-green-600"}`}>
                                    ₹{remainingAmount.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
};

export default PathologyRegistration;