// @/app/pathology/patient-entry/PathologyRegistration.tsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { saveHospitalToDB } from "@/lib/hospitalStorage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar, Clock, Plus, X, Search, Trash2, Timer, FlaskConical } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

// 🟢 NEW IMPORT: Import Bill Utility and DoctorLite interface
import { openUniversalBillInNewTabProgrammatically, type UniversalBillData, type BillServiceItem, type DoctorLite } from "./universal-bill-generator"

import type { IUnifiedFormInput, VisitType, TpaType } from "./page"

const TABLE = { PATIENT: "patient_detail", REGISTRATION: "zregistration", DOCTOR: "zdoctorlist", BLOOD: "zblood_test" } as const;

// --- Types ---

interface PatientData { uhid: string; name: string; contact: string; age: number; dayType: "year" | "month" | "day"; title: string; address?: string; gender: string; }
interface CommonRegDetails { hospitalName: string; visitType: VisitType; doctorName: string; tpa: TpaType; registrationDate: string; registrationTime: string; sendWhatsApp: boolean; sourceOpdId: number | null; sourceIpdId: number | null; }
interface PathologyData { estimatedTime: string; bloodTests: any[]; discountAmount: number; paymentEntries: any[]; }
interface PackageType { id: number; package_name: string; tests: any[]; discountamount: number; }

interface PathRegFormFields extends CommonRegDetails, PathologyData { }


// --- Helpers ---

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

function calculateMaxEstimatedTime(tests: any[], bloodRows: any[]): number {
    if (tests.length === 0) return 0;
    let maxTime = 0;
    tests.forEach((selectedTest: any) => {
        const testDef = bloodRows.find((row: any) => row.id === selectedTest.testId);
        const timeInMinutes = parseInt((testDef as any)?.estimated_time_mm || '0', 10);
        if (!isNaN(timeInMinutes) && timeInMinutes > maxTime) { maxTime = timeInMinutes; }
    });
    return maxTime;
}

function generateFallbackUHID() {
    return `P${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
}

const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => { return fn() }


// 🟢 UPDATED: WhatsApp Sender Function
const sendWhatsAppNotification = async (
    contactNumber: string,
    patientName: string,
    regId: number,
    estTimeDuration: string,
    testNames: string,
    financials: { total: number, paid: number, balance: number }
): Promise<void> => {
    const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || "";

    if (!apiKey) {
        console.warn("⚠️ WhatsApp API Key missing. Notification skipped.");
        return;
    }

    const messageText = `Dear *${patientName}*,\n\nThank you for visiting Cigma Clinic.\n\n*Pathology Registration Confirmed*\n🆔 Reg ID: *${regId}*\n🧪 Tests: ${testNames}\n⏱ Est. Report Time: ${estTimeDuration}\n\n*Payment Summary:*\n💰 Total: ₹${financials.total.toFixed(2)}\n✅ Paid: ₹${financials.paid.toFixed(2)}\n⚠️ Balance: ₹${financials.balance.toFixed(2)}\n\nYour reports will be ready shortly.`;

    try {
        const response = await fetch("https://evo.infispark.in/message/sendText/cigmadiagnostic", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": apiKey
            },
            body: JSON.stringify({
                number: `91${contactNumber}`,
                text: messageText
            }),
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error("❌ WhatsApp API Error:", errData);
        } else {
            console.log(`✅ WhatsApp sent to ${contactNumber}`);
        }
    } catch (error) {
        console.error("❌ WhatsApp Network Error:", error);
    }
};


// --- Component Interfaces and Main Component ---

interface PathologyProps {
    patientData: PatientData;
    isExistingPatient: boolean;
    doctorList: DoctorLite[]; // 🟢 CHANGED: Using DoctorLite interface
    bloodRows: any[];
    packageRows: PackageType[];
    pathologyData: PathologyData;
    setPathologyData: (data: PathologyData) => void;
    commonRegDetails: CommonRegDetails;
    setCommonRegDetails: (key: keyof CommonRegDetails, value: any) => void;
    opdRecords: any[]; ipdRecords: any[];
    showSourceSelection: boolean; setShowSourceSelection: React.Dispatch<React.SetStateAction<boolean>>;
    fetchSourceRecords: (uhid: string, visitType: 'opd' | 'ipd', autoOpen: boolean) => Promise<void>;
    onSuccess: () => void;
}

const PathologyRegistration: React.FC<PathologyProps> = ({
    patientData, isExistingPatient, bloodRows, packageRows, doctorList,
    pathologyData, setPathologyData,
    commonRegDetails, setCommonRegDetails,
    opdRecords, ipdRecords, // Added these
    fetchSourceRecords, setShowSourceSelection,
    onSuccess,
}) => {

    const defaultRHFValues: PathRegFormFields = useMemo(() => ({
        ...commonRegDetails,
        ...pathologyData,
    }), [commonRegDetails, pathologyData]);

    const {
        control, watch, setValue, getValues, handleSubmit, reset, // 🟢 ADDED: reset function
        formState: { isSubmitting, errors },
    } = useForm<PathRegFormFields>({ defaultValues: defaultRHFValues });

    // Save form state to parent ONLY when the component unmounts (e.g. tab switch)
    // This avoids rendering feedback loops on every single keystroke.
    const getValuesRef = useRef(getValues);
    getValuesRef.current = getValues;

    useEffect(() => {
        return () => {
            const currentValues = getValuesRef.current();
            const { estimatedTime, bloodTests, discountAmount, paymentEntries, ...regDetails } = currentValues;
            
            // Sync Pathology specific details
            setPathologyData({ estimatedTime, bloodTests, discountAmount, paymentEntries });

            // Sync common registration details
            (Object.keys(regDetails) as Array<keyof CommonRegDetails>).forEach((key) => {
                setCommonRegDetails(key, regDetails[key]);
            });
        };
    }, [setPathologyData, setCommonRegDetails]);

    const { fields: bloodTestFields, append: appendBloodTest, remove: removeBloodTest } = useFieldArray({ control, name: "bloodTests" as "bloodTests" });
    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control, name: "paymentEntries" as "paymentEntries" });

    const bloodTests = watch("bloodTests");
    const discountAmount = watch("discountAmount") || 0;
    const paymentEntries = watch("paymentEntries") || [];
    const watchEstimatedTime = watch("estimatedTime");
    const watchVisitType = watch("visitType");
    const watchSourceOpdId = watch("sourceOpdId");

    // Selective real-time sync for visitType and sourceOpdId to allow immediate parent popover / state sync
    useEffect(() => {
        if (watchVisitType !== commonRegDetails.visitType) {
            setCommonRegDetails("visitType", watchVisitType);
        }
    }, [watchVisitType, commonRegDetails.visitType, setCommonRegDetails]);

    useEffect(() => {
        if (watchSourceOpdId !== commonRegDetails.sourceOpdId) {
            setCommonRegDetails("sourceOpdId", watchSourceOpdId);
        }
    }, [watchSourceOpdId, commonRegDetails.sourceOpdId, setCommonRegDetails]);

    useEffect(() => {
        if (commonRegDetails.hospitalName && commonRegDetails.hospitalName !== watch("hospitalName")) {
            setValue("hospitalName", commonRegDetails.hospitalName);
        }
    }, [commonRegDetails.hospitalName, setValue, watch]);

    const totalAmount = bloodTests.reduce((s: number, t: any) => s + (t.price || 0), 0);
    const totalPaid = paymentEntries.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const remainingAmount = totalAmount - discountAmount - totalPaid;

    const unselectedTests = useMemo(() => bloodRows.filter((t: any) => !bloodTests.some((bt: any) => bt.testId === t.id)), [bloodRows, bloodTests]);
    const testSearchRef = useRef<HTMLDivElement | null>(null);
    const [searchText, setSearchText] = useState("");

    useEffect(() => {
        const maxMinutes = calculateMaxEstimatedTime(bloodTests, bloodRows);
        setValue("estimatedTime", String(maxMinutes));
    }, [bloodTests, bloodRows, setValue]);

    useEffect(() => {
        if (patientData.uhid && (watchVisitType === 'opd')) {
            // Fetch records but DO NOT auto-open popup
            fetchSourceRecords(patientData.uhid, 'opd', false);
        } else {
            // Cleanup if switching away from source-dependent types
            if (watchVisitType === 'direct') { setValue("sourceOpdId", null); setValue("sourceIpdId", null); }
        }
    }, [patientData.uhid, watchVisitType, fetchSourceRecords, setValue]);

    const addTestById = (id: number) => {
        const t = bloodRows.find((x: any) => x.id === id);
        if (!t) return;
        // Include serviceType from the fetched row
        appendBloodTest({ testId: t.id, testName: t.test_name, price: t.price, testType: t.outsource ? "outsource" : "inhospital", serviceType: t.type || "blood_test" });
        setSearchText("");
    }

    const removeAllTests = () => { for (let i = bloodTestFields.length - 1; i >= 0; i--) removeBloodTest(i) }
    const addAllTests = () => { unselectedTests.forEach((t: any) => addTestById(t.id)) }
    const addPaymentEntry = () => {
        const currentTime = watch("registrationTime");
        appendPayment({ amount: 0, paymentMode: "online", time: currentTime });
    }

    // --- ON SUBMIT HANDLER ---
    const onSubmit: SubmitHandler<PathRegFormFields> = async (data) => {
        if (!patientData.name || !patientData.contact || patientData.age === 0 || !patientData.title || !patientData.gender) {
            alert("Please ensure all Patient Details are filled out.");
            return;
        }
        if (data.bloodTests.length === 0) { alert("Please add at least one test."); return; }
        if (data.doctorName.trim().length === 0) { alert("Doctor Name is required."); return; }
        if ((data.visitType === 'opd' && data.sourceOpdId === null) || (data.visitType === 'ipd' && data.sourceIpdId === null)) { alert(`Please select a source ${data.visitType.toUpperCase()} registration.`); return; }

        try {
            let finalUHID: string = patientData.uhid;
            const dob = calculateDOB(patientData.age, patientData.dayType);
            const totalDay = patientData.age * (patientData.dayType === "year" ? 360 : patientData.dayType === "month" ? 30 : 1);

            const patientPayload = {
                name: patientData.name.toUpperCase(),
                number: Number(patientData.contact),
                age: patientData.age,
                age_unit: patientData.dayType,
                total_day: totalDay,
                gender: patientData.gender,
                address: patientData.address || "",
                title: patientData.title,
                dob: dob,
            };

            // 1. HANDLE PATIENT
            if (!finalUHID) {
                const newUHID = generateFallbackUHID();
                const { data: newP, error: newPErr } = await withRetry(async () =>
                    supabase.from(TABLE.PATIENT).insert({ ...patientPayload, uhid: newUHID }).select().single()
                );
                if (newPErr) throw newPErr;
                finalUHID = (newP as any)?.uhid || newUHID;
            } else {
                await withRetry(async () => supabase.from(TABLE.PATIENT).update(patientPayload).eq("uhid", finalUHID));
            }

            // 2. HANDLE REGISTRATION
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
            const registrationId = (regData as any).id;
            const registrationDate = new Date(data.registrationDate); // Convert date string to Date object for the bill

            // 3. 🟢 GENERATE AND OPEN BILL
            const serviceItems: BillServiceItem[] = data.bloodTests.map((t: any) => ({
                type: 'Pathology',
                name: t.testName,
                charges: t.price,
                doctor: data.doctorName,
                details: (t.serviceType || "blood_test").replace(/_/g, " ").toUpperCase() // Display Service Type
            }));

            const billData: UniversalBillData = {
                patientInfo: { ...patientData, uhid: finalUHID },
                registrationId: registrationId,
                date: registrationDate,
                time: data.registrationTime,
                referredBy: data.doctorName,
                discount: data.discountAmount,
                services: serviceItems,
                paymentEntries: data.paymentEntries.map(p => ({
                    amount: p.amount,
                    paymentMode: p.paymentMode.toLowerCase() as 'online' | 'cash' | 'card',
                    time: new Date().toISOString()
                })),
                sendWhatsApp: data.sendWhatsApp
            };

            await openUniversalBillInNewTabProgrammatically(billData, doctorList);

            // 4. 🟢 SEND WHATSAPP
            if (data.sendWhatsApp && patientData.contact && totalPaid > 0) {
                const contactNumber = String(patientData.contact);
                const estTimeDuration = formatMinutesToDuration(parseInt(data.estimatedTime, 10) || 0);
                const testNameList = data.bloodTests.map((t: any) => t.testName).join(", ");

                await sendWhatsAppNotification(
                    contactNumber,
                    patientData.name,
                    registrationId,
                    estTimeDuration,
                    testNameList,
                    { total: totalAmount, paid: totalPaid, balance: remainingAmount }
                );
            }

            alert(`Pathology Registration successful (ID: ${registrationId}) ✅`);

            // 5. 🟢 CLEAR FORM: Reset the form fields managed by react-hook-form.
            // We ensure dynamic arrays are cleared, and other fields revert to defaults.
            reset({
                ...defaultRHFValues,
                bloodTests: [],
                paymentEntries: [],
                discountAmount: 0,
            });

            // Call the onSuccess callback (which should clear the main patientData and commonRegDetails in the parent)
            onSuccess();

        } catch (err: any) {
            console.error(err);
            alert(err.message ?? "Unexpected error during Pathology submission");
        }
    }


    // 🟢 SYNC FROM PARENT: When Popup updates Parent state, sync it back to Local Form
    useEffect(() => {
        if (commonRegDetails.sourceOpdId !== watch("sourceOpdId")) {
            setValue("sourceOpdId", commonRegDetails.sourceOpdId);
        }
        // Sync Doctor Name if changed by source selection
        if (commonRegDetails.doctorName && commonRegDetails.doctorName !== watch("doctorName")) {
            setValue("doctorName", commonRegDetails.doctorName);
        }
    }, [commonRegDetails.sourceOpdId, commonRegDetails.doctorName, setValue, watch]);

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-t-lg border-b border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center"><FlaskConical className="mr-2 h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 shrink-0" />Pathology/Lab Services</h3>
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 h-10 sm:h-9 font-medium shadow-sm">
                    {isSubmitting ? "Submitting..." : "Submit Pathology Order"}
                </Button>
            </div>

            <div className="p-2 sm:p-3 space-y-3">
                <div className="mb-3 sm:mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 className="text-base sm:text-lg font-bold text-gray-700 mb-3">Registration & Visit Details</h2>
                    <div className="grid grid-cols-12 gap-2 sm:gap-3">
                        <div className="col-span-12 sm:col-span-6 md:col-span-3">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Hospital</Label>
                            <Select
                                value={watch("hospitalName") || commonRegDetails.hospitalName || "Cigma Clinic"}
                                onValueChange={(v) => {
                                    setValue("hospitalName", v);
                                    setCommonRegDetails("hospitalName", v);
                                    saveHospitalToDB(v);
                                }}
                            >
                                <SelectTrigger className="h-9 sm:h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cigma Clinic">Cigma Clinic</SelectItem>
                                    <SelectItem value="Rehmania Hospital">Rehmania Hospital</SelectItem>
                                    <SelectItem value="Jeevdani Hospital">Jeevdani Hospital</SelectItem>
                                    <SelectItem value="Dausup Hospital">Dausup Hospital</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-12 sm:col-span-6 md:col-span-4 relative">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Doctor Name *</Label>
                            <Input {...control.register("doctorName", { required: "Doctor is required" })} className="h-9 sm:h-8 text-sm" placeholder="Referring Doctor" />
                            {errors.doctorName && <p className="text-red-500 text-xs mt-1">{errors.doctorName.message}</p>}
                        </div>
                        <div className="col-span-6 sm:col-span-3 md:col-span-2">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Date</Label>
                            <div className="relative flex items-center text-sm">
                                <Calendar className="h-4 w-4 text-gray-500 absolute left-2 pointer-events-none" />
                                <input type="date" {...control.register("registrationDate")} className="p-1 border border-input rounded text-sm w-full h-9 sm:h-8 pl-8 bg-background" />
                            </div>
                        </div>
                        <div className="col-span-6 sm:col-span-3 md:col-span-2">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Time</Label>
                            <div className="relative flex items-center text-sm">
                                <Clock className="h-4 w-4 text-gray-500 absolute left-2 pointer-events-none" />
                                <input type="text" {...control.register("registrationTime")} className="p-1 border border-input rounded text-sm w-full h-9 sm:h-8 pl-8 bg-background" placeholder="12:00 PM" />
                            </div>
                        </div>
                        <div className={`col-span-8 sm:col-span-6 md:col-span-${watch("visitType") === 'opd' ? '3' : '1'} transition-all duration-300`}>
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Visit Type</Label>
                            <div className="flex gap-2">
                                <Select value={watch("visitType")} onValueChange={(v) => setValue("visitType", v as any)} disabled={!isExistingPatient} >
                                    <SelectTrigger className={`h-9 sm:h-8 w-24 text-sm ${isExistingPatient ? "" : "bg-gray-100"}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="direct">Direct</SelectItem>
                                        <SelectItem value="opd" disabled={!isExistingPatient}>OPD</SelectItem>
                                    </SelectContent>
                                </Select>

                                {watch("visitType") === "opd" && (
                                    <div className="flex-1">
                                        <Select
                                            value={String(watch("sourceOpdId") || "")}
                                            onValueChange={(val) => {
                                                const selected = opdRecords.find((r: any) => String(r.opd_id) === String(val));
                                                if (selected) {
                                                    setValue("sourceOpdId", selected.opd_id);
                                                    setValue("doctorName", selected.refer_by);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="h-9 sm:h-8 w-full bg-blue-50 border-blue-200 text-xs">
                                                <SelectValue placeholder="Select Source..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {opdRecords.map((r: any) => (
                                                    <SelectItem key={r.opd_id} value={String(r.opd_id)}>
                                                        <span className="font-medium">#{r.opd_id}</span> - {new Date(r.date).toLocaleDateString()} - <span className="text-xs text-gray-500">Dr. {r.refer_by}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="col-span-4 sm:col-span-6 md:col-span-1">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Type</Label>
                            <Select value={watch("tpa") === true ? "Yes" : "No"} onValueChange={(v) => setValue("tpa", v === "Yes")}>
                                <SelectTrigger className="h-9 sm:h-8 text-sm"><SelectValue placeholder="Normal/TPA" /></SelectTrigger>
                                <SelectContent><SelectItem value="No">Normal</SelectItem><SelectItem value="Yes">TPA</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-12 sm:col-span-6 mt-1 sm:mt-2">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Report Est. Time (Pathology)</Label>
                            <div className="relative flex items-center h-9 sm:h-8">
                                <Input type="number" {...control.register("estimatedTime", { required: "Time is required", min: { value: 0, message: "Positive" }, valueAsNumber: true, })} className="h-9 sm:h-8 w-24 pl-8 text-sm" />
                                <Timer className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                <span className="ml-2 text-xs sm:text-sm text-gray-600 font-medium truncate">Minutes: <span className="text-blue-600 font-bold">{formatMinutesToDuration(parseInt(watchEstimatedTime, 10) || 0)}</span></span>
                            </div>
                            {errors.estimatedTime && <p className="text-red-500 text-xs mt-1">{errors.estimatedTime.message}</p>}
                        </div>
                        <div className="col-span-12 sm:col-span-6 mt-1 sm:mt-2 flex items-center h-9 sm:h-8">
                            <Checkbox checked={watch("sendWhatsApp")} onCheckedChange={(v) => setValue("sendWhatsApp", !!v)} id="patho-whatsapp-checkbox" />
                            <Label htmlFor="patho-whatsapp-checkbox" className="text-xs sm:text-sm cursor-pointer ml-2 flex items-center gap-1 font-medium"><span className="text-green-600">📱</span>Send WhatsApp SMS</Label>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-700">Tests Selection</h3>
                            <div className="flex items-center space-x-1 md:hidden">
                                <Button type="button" variant="outline" size="sm" onClick={addAllTests} className="h-8 text-xs px-2.5"> Add All </Button>
                                <Button type="button" variant="outline" size="sm" onClick={removeAllTests} className="h-8 text-xs px-2.5"> Clear </Button>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                <Label className="text-xs text-gray-500 shrink-0">Package:</Label>
                                <Select value={"none"} onValueChange={(pkgId) => {
                                    if (!pkgId || pkgId === "none") return; const pkg = packageRows.find((p: any) => String(p.id) === String(pkgId)); if (pkg) { removeAllTests(); pkg.tests.forEach((t: any) => { addTestById(t.testId); }); setValue("discountAmount", pkg.discountamount || 0); }
                                }}>
                                    <SelectTrigger className="h-9 sm:h-8 w-full sm:w-48 text-xs"><SelectValue placeholder="Select package" /></SelectTrigger>
                                    <SelectContent><SelectItem value="none">No Package</SelectItem>{packageRows.map((pkg: any) => (<SelectItem key={pkg.id} value={String(pkg.id)}>{pkg.package_name} (₹{pkg.discountamount} OFF)</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            <div className="hidden md:flex items-center space-x-1">
                                <Button type="button" variant="outline" size="sm" onClick={addAllTests} className="h-8 text-xs"> Add All </Button>
                                <Button type="button" variant="outline" size="sm" onClick={removeAllTests} className="h-8 text-xs"> Remove All </Button>
                            </div>
                            <div className="relative w-full sm:w-56" ref={testSearchRef}>
                                <Input type="text" placeholder="Search tests..." className="h-9 sm:h-8 text-xs pr-8 w-full" value={searchText} onChange={(e) => { setSearchText(e.target.value) }} />
                                <Search className="h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                {searchText.trim() && (
                                    <ul className="absolute z-50 w-full bg-white border border-gray-300 mt-1 rounded-lg max-h-48 overflow-y-auto text-sm shadow-xl">
                                        {unselectedTests.filter((t: any) => t.test_name.toLowerCase().includes(searchText.toLowerCase())).map((t: any) => (
                                            <li key={t.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0" onClick={() => addTestById(t.id)}>
                                                <span className="font-semibold text-xs bg-gray-200 px-1.5 py-0.5 rounded mr-1.5">{t.type?.replace(/_/g, " ") || "Blood Test"}</span>
                                                <span className="font-medium text-gray-800">{t.test_name}</span> - <span className="text-indigo-600 font-bold">₹{t.price}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                        <Table className="min-w-[500px]">
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                    <TableHead className="w-[35%] py-2 px-2.5 text-xs font-semibold">Test Name</TableHead>
                                    <TableHead className="w-[20%] py-2 px-2.5 text-xs font-semibold">Price (₹)</TableHead>
                                    <TableHead className="w-[20%] py-2 px-2.5 text-xs font-semibold">Service Type</TableHead>
                                    <TableHead className="w-[15%] py-2 px-2.5 text-xs font-semibold">Source</TableHead>
                                    <TableHead className="w-[10%] py-2 px-2.5 text-right text-xs font-semibold" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bloodTestFields.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-gray-400 text-sm">No tests selected. Search or choose a package above.</TableCell></TableRow>
                                ) : (
                                    bloodTestFields.map((field, idx) => (
                                        <TableRow key={field.id} className="hover:bg-gray-50">
                                            <TableCell className="py-2 px-2.5 font-medium text-xs sm:text-sm">{watch(`bloodTests.${idx}.testName`)}</TableCell>
                                            <TableCell className="py-2 px-2.5">
                                                <Input type="number" {...control.register(`bloodTests.${idx}.price` as `bloodTests.${number}.price`, { valueAsNumber: true })} className="h-8 w-24 text-xs font-semibold" disabled={(watch(`bloodTests.${idx}.testName`) || "").trim().toLowerCase() !== "histopathology"} />
                                            </TableCell>
                                            <TableCell className="py-2 px-2.5">
                                                <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full whitespace-nowrap">
                                                    {(watch(`bloodTests.${idx}.serviceType` as any) || "blood_test").replace(/_/g, " ")}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-2 px-2.5">
                                                <Select value={watch(`bloodTests.${idx}.testType`)} onValueChange={(v) => setValue(`bloodTests.${idx}.testType` as `bloodTests.${number}.testType`, v as any)}>
                                                    <SelectTrigger className="h-8 text-xs"> <SelectValue /> </SelectTrigger>
                                                    <SelectContent><SelectItem value="inhospital">InHouse</SelectItem><SelectItem value="outsource">Outsource</SelectItem></SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="py-2 px-2.5 text-right">
                                                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeBloodTest(idx)} ><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-white p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-700">Payment Details</h3>
                            <Button type="button" variant="outline" size="sm" onClick={addPaymentEntry} className="h-8 text-xs font-medium"><Plus className="h-3.5 w-3.5 mr-1" /> Add Payment</Button>
                        </div>
                        <div className="mb-3">
                            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 block">Discount (₹)</Label>
                            <Input type="number" step="0.01" {...control.register("discountAmount", { valueAsNumber: true })} placeholder="0" className="h-9 sm:h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                            {paymentFields.length === 0 ? (<div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>) : (
                                paymentFields.map((field, idx) => (
                                    <div key={field.id} className="border rounded-lg p-2.5 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs sm:text-sm font-semibold text-gray-700">Payment #{idx + 1}</span>
                                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => removePayment(idx)} >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs text-gray-500 mb-1 block">Amount (₹)</Label>
                                                <Input type="number" step="0.01" {...control.register(`paymentEntries.${idx}.amount` as `paymentEntries.${number}.amount`, { valueAsNumber: true })} className="h-9 sm:h-8 text-sm" placeholder="0" />
                                            </div>
                                            <div>
                                                <Label className="text-xs text-gray-500 mb-1 block">Mode</Label>
                                                <Select value={watch(`paymentEntries.${idx}.paymentMode`)} onValueChange={(v) => setValue(`paymentEntries.${idx}.paymentMode` as `paymentEntries.${number}.paymentMode`, v as any)} >
                                                    <SelectTrigger className="h-9 sm:h-8 text-sm"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col justify-between">
                        <div>
                            <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-3">Payment Summary</h3>
                            <div className="space-y-2.5 mb-3 text-sm">
                                <div className="flex justify-between text-gray-600"><span>Total Amount:</span><span className="font-semibold text-gray-900">₹{totalAmount.toFixed(2)}</span></div>
                                <div className="flex justify-between text-gray-600"><span>Discount:</span><span className="font-semibold text-indigo-600">₹{discountAmount.toFixed(2)}</span></div>
                                <div className="flex justify-between text-gray-600"><span>Total Paid:</span><span className="font-semibold text-green-600">₹{totalPaid.toFixed(2)}</span></div>
                                <div className="flex justify-between border-t border-gray-200 pt-2 text-base">
                                    <span className="font-bold text-gray-800">Remaining Amount:</span>
                                    <span className={`font-bold ${remainingAmount < 0 ? "text-red-600" : remainingAmount > 0 ? "text-orange-600" : "text-green-600"}`}>
                                        ₹{remainingAmount.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
};

export default PathologyRegistration;