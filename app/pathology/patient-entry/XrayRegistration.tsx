// @/app/pathology/patient-entry/XrayRegistration.tsx
import React, { useEffect, useMemo, useRef, useCallback, useState } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { CalendarDays, Plus, X, Search, Trash2, Stethoscope } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

// 🟢 NEW IMPORT: Import Bill Utility
import { openUniversalBillInNewTabProgrammatically, type UniversalBillData, type BillServiceItem, type DoctorLite } from "./universal-bill-generator"

import type { IUnifiedFormInput, VisitType, TpaType } from "./page"

const TABLE = { PATIENT: "patient_detail", XRAY: "x-raydetail" } as const;

interface PatientData { uhid: string; name: string; contact: string; age: number; dayType: "year" | "month" | "day"; title: string; address?: string; gender: string; }
interface CommonRegDetails { hospitalName: string; visitType: VisitType; doctorName: string; tpa: TpaType; registrationDate: string; registrationTime: string; sendWhatsApp: boolean; sourceOpdId: number | null; sourceIpdId: number | null; }
interface XrayData { billNumber: string; remark: string; dateOfAppointment: Date; xrayTests: any[]; discount: number; payments: any[]; }

interface XrayRegFormFields extends CommonRegDetails, XrayData { }

function throwIfError(error: any) { if (error) throw error; }
function calculateDOB(age: number, unit: 'year' | 'month' | 'day'): string {
    const today = new Date(); const dob = new Date(today);
    dob.setHours(0, 0, 0, 0);
    if (unit === 'year') { dob.setFullYear(dob.getFullYear() - age); }
    else if (unit === 'month') { dob.setMonth(dob.getMonth() - age); }
    else if (unit === 'day') { dob.setDate(dob.getDate() - age); }
    return dob.toISOString().split('T')[0];
}
const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => { return fn() }

// --- DUMMY DATA MAPS ---
const xrayData = {
    xray_price_list: [{ examination: "Chest X-ray PA", price: 500, ward: 600, icu: 700 }, { examination: "KUB", price: 400, ward: 500, icu: 600 }],
    procedure: [{ name: "USG Abdomen", price: 1000 }]
};
const gautamiXrayPriceList = [{ Examination: "Chest X-ray PA", OPD_Amt: 450, Portable: 550 }];
const gautamiProcedureList = [{ Procedure: "PICC Line Insertion", Amount: 2500 }];

const examinationPriceMap = (xrayData.xray_price_list || []).reduce<Record<string, any>>((acc, item) => { acc[item.examination] = item; return acc; }, {});
const procedurePriceMap = (xrayData.procedure || []).reduce<Record<string, any>>((acc, item) => { acc[item.name] = item; return acc; }, {});
const gautamiExaminationPriceMap = (gautamiXrayPriceList || []).reduce<Record<string, any>>((acc, item) => { acc[item.Examination] = item; return acc; }, {});
const gautamiProcedurePriceMap = (gautamiProcedureList || []).reduce<Record<string, any>>((acc, item) => { acc[item.Procedure] = item; return acc; }, {});
const regularExaminations = (xrayData.xray_price_list || []).map((item) => item.examination);
const procedureExaminations = (xrayData.procedure || []).map((item) => item.name);
const gautamiRegularExaminations = (gautamiXrayPriceList || []).map((item) => item.Examination);
const gautamiProcedureExaminations = (gautamiProcedureList || []).map((item) => item.Procedure);

// 🟢 UPDATED: WhatsApp Sender Function for X-Ray
const sendXrayWhatsAppNotification = async (
    contactNumber: string,
    patientName: string,
    billNumber: string,
    apptDate: Date,
    examNames: string,
    financials: { total: number, paid: number, balance: number }
): Promise<void> => {
    const apiKey = process.env.NEXT_PUBLIC_WHATSAPP_API_KEY || "";

    if (!apiKey) {
        console.warn("⚠️ WhatsApp API Key missing. Notification skipped.");
        return;
    }

    const formattedDate = format(apptDate, "PPP");
    const messageText = `Dear *${patientName}*,\n\nThank you for visiting Cigma Clinic.\n\n*Radiology/X-ray Order Confirmed*\n📅 Date: ${formattedDate}\n🔢 Bill No: *${billNumber || "N/A"}*\n☢️ Exams: ${examNames}\n\n*Payment Summary:*\n💰 Total: ₹${financials.total.toFixed(2)}\n✅ Paid: ₹${financials.paid.toFixed(2)}\n⚠️ Balance: ₹${financials.balance.toFixed(2)}`;

    try {
        const response = await fetch("https://evo.infispark.in/message/sendText/cigma", {
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

interface XrayProps {
    patientData: PatientData;
    isExistingPatient: boolean;
    doctorList: DoctorLite[]; // Use new DoctorLite interface
    xrayData: XrayData;
    setXrayData: (data: XrayData) => void;
    commonRegDetails: CommonRegDetails;
    setCommonRegDetails: (key: keyof CommonRegDetails, value: any) => void;
    opdRecords: any[]; ipdRecords: any[];
    showSourceSelection: boolean; setShowSourceSelection: React.Dispatch<React.SetStateAction<boolean>>;
    fetchSourceRecords: (uhid: string, visitType: 'opd' | 'ipd', autoOpen: boolean) => Promise<void>;
    onSuccess: () => void;
}

const XrayRegistration: React.FC<XrayProps> = ({
    patientData, isExistingPatient, doctorList,
    xrayData, setXrayData,
    commonRegDetails, setCommonRegDetails,
    fetchSourceRecords, setShowSourceSelection,
    onSuccess,
}) => {

    const defaultRHFValues: XrayRegFormFields = useMemo(() => ({
        ...commonRegDetails,
        ...xrayData,
    }), [commonRegDetails, xrayData]);

    const {
        control, watch, setValue, handleSubmit, reset, // 🟢 ADDED: reset function
        formState: { isSubmitting, errors },
    } = useForm<XrayRegFormFields>({ defaultValues: defaultRHFValues });

    const watchFields = watch();

    useEffect(() => {
        const { billNumber, remark, dateOfAppointment, xrayTests, discount, payments, ...regDetails } = watchFields;
        setXrayData({ billNumber, remark, dateOfAppointment, xrayTests, discount, payments });
        (Object.keys(regDetails) as Array<keyof CommonRegDetails>).forEach((key) => {
            // @ts-ignore
            setCommonRegDetails(key, regDetails[key]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(watchFields), setXrayData, setCommonRegDetails]);

    const { fields: xrayTestFields, append: appendXrayTest, remove: removeXrayTest } = useFieldArray({ control, name: "xrayTests" as "xrayTests" });
    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control, name: "payments" as "payments" });

    const xrayTests = watch("xrayTests");
    const discount = watch("discount") || 0;
    const payments = watch("payments") || [];
    const watchVisitType = watch("visitType");
    const isGautamiHospital = watch("hospitalName") === "Cigma clinic";

    const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
    const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    const getCurrentDataMaps = useCallback(() => {
        if (isGautamiHospital) { return { examinationMap: gautamiExaminationPriceMap, procedureMap: gautamiProcedureList, regularExams: gautamiRegularExaminations, procedureExams: gautamiProcedureExaminations } }
        return { examinationMap: examinationPriceMap, procedureMap: procedurePriceMap, regularExams: regularExaminations, procedureExams: procedureExaminations }
    }, [isGautamiHospital]);

    const totalAmount = xrayTests.reduce((s: number, test: any) => s + (test.amount || 0), 0);
    const totalPaid = payments.reduce((s: number, payment: any) => s + (payment.amount || 0), 0);
    const remainingAmount = totalAmount - discount - totalPaid;

    useEffect(() => {
        if (isExistingPatient && (watchVisitType === 'opd' || watchVisitType === 'ipd')) {
            // @ts-ignore
            fetchSourceRecords(patientData.uhid, watchVisitType as 'opd' | 'ipd', true);
        } else {
            setShowSourceSelection(false);
            if (watchVisitType === 'direct') { setValue("sourceOpdId", null); setValue("sourceIpdId", null); }
        }
    }, [patientData.uhid, watchVisitType, isExistingPatient, fetchSourceRecords, setShowSourceSelection, setValue]);

    const handleSearchChange = (index: number, searchTerm: string) => { setSearchTerms((prev) => ({ ...prev, [index]: searchTerm })) }

    const getFilteredExaminations = (index: number) => {
        const searchTerm = searchTerms[index] || ""
        const { regularExams, procedureExams } = getCurrentDataMaps()
        if (!searchTerm) { return { regular: regularExams, procedures: procedureExams } }
        const filteredRegular = regularExams.filter((exam) => exam.toLowerCase().includes(searchTerm.toLowerCase()))
        const filteredProcedures = procedureExams.filter((exam) => exam.toLowerCase().includes(searchTerm.toLowerCase()))
        return { regular: filteredRegular, procedures: filteredProcedures }
    }

    const handleTestSelectChange = (index: number, value: string) => {
        const newTests = [...xrayTests]
        const { examinationMap, procedureMap } = getCurrentDataMaps()
        let xrayItem: any = undefined;
        let procedureItem: any = undefined;
        if (Array.isArray(examinationMap)) { xrayItem = examinationMap.find((item: any) => item.Procedure === value); } else if (typeof examinationMap === "object" && examinationMap !== null) { xrayItem = (examinationMap as Record<string, any>)[value]; }
        if (Array.isArray(procedureMap)) { procedureItem = procedureMap.find((item: any) => item.Procedure === value); } else if (typeof procedureMap === "object" && procedureMap !== null) { procedureItem = (procedureMap as Record<string, any>)[value]; }

        let amount = 0
        if (isGautamiHospital) {
            if (xrayItem) { amount = xrayItem.OPD_Amt || 0; } else if (procedureItem) { amount = procedureItem.Amount || 0; }
        } else {
            if (xrayItem) { amount = xrayItem.price || 0; } else if (procedureItem) { amount = procedureItem.price || 0; }
        }
        newTests[index] = { ...newTests[index], examination: value, amount: amount };
        setValue("xrayTests", newTests);
        setSearchTerms((prev) => ({ ...prev, [index]: "" }))
    }

    const handleAddTest = () => { appendXrayTest({ examination: "", amount: 0 }); }
    const handleRemoveTest = (index: number) => { if (xrayTestFields.length > 1) { removeXrayTest(index); } }

    // --- ON SUBMIT HANDLER ---
    const onSubmit: SubmitHandler<XrayRegFormFields> = async (data) => {
        if (!isExistingPatient) {
            alert("Please register the patient or select an existing one before submitting the order.");
            return;
        }
        if (data.xrayTests.length === 0 || !data.xrayTests[0].examination) { alert("Please add at least one X-ray examination."); return; }
        if (data.doctorName.trim().length === 0) { alert("Doctor Name is required."); return; }
        if ((data.visitType === 'opd' && data.sourceOpdId === null) || (data.visitType === 'ipd' && data.sourceIpdId === null)) {
            alert(`Please select a source ${data.visitType.toUpperCase()} registration.`); return;
        }

        try {
            let finalUHID: string = patientData.uhid;

            // 1. UPDATE PATIENT
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
            await withRetry(async () => supabase.from(TABLE.PATIENT).update(patientPayload).eq("uhid", finalUHID));

            // 2. HANDLE X-RAY ORDER (Assuming Supabase auto-generates the X-ray ID)
            const amountDetail = { totalAmount: totalAmount, discount: data.discount, paymentHistory: data.payments.map((p: any) => ({ amount: p.amount, paymentMode: p.paymentMode.toLowerCase(), time: new Date().toISOString() })) };
            const xrayDetail = data.xrayTests.map((test: any) => ({ Examination: test.examination, Xray_Via: "N/A", Amount: test.amount, }));

            const dataToInsert = {
                patient_uhid: finalUHID, created_at: data.dateOfAppointment.toISOString(), "Hospital_name": data.hospitalName,
                bill_number: data.billNumber || null, "Refer_doctorname": data.doctorName || null, "Visit_type": data.visitType.replace('direct', 'Direct').toUpperCase(),
                "Tpa": data.tpa ? 'Yes' : 'No', "Remark": data.remark || null, "x-ray_detail": xrayDetail, amount_detail: amountDetail,
            };

            const result = await withRetry(async () => supabase.from(TABLE.XRAY).insert(dataToInsert).select().single());
            if (result.error) throw result.error;

            const registrationId = (result.data as any).id; // Assuming ID is the auto-generated PK

            // 3. 🟢 GENERATE AND OPEN BILL
            // 3. 🟢 GENERATE AND OPEN BILL
            const { regularExams, procedureExams } = getCurrentDataMaps();

            const serviceItems: BillServiceItem[] = data.xrayTests.map((t: any) => {
                let sType = "X-RAY"; // Default
                if (t.examination.toLowerCase().includes("usg") || t.examination.toLowerCase().includes("doppler") || t.examination.toLowerCase().includes("sonography")) {
                    sType = "SONOGRAPHY";
                } else if (procedureExams.includes(t.examination)) {
                    sType = "PROCEDURE";
                } else if (!regularExams.includes(t.examination)) {
                    // Fallback for custom entries or mismatches
                    if (t.examination.toLowerCase().includes("usg")) sType = "SONOGRAPHY";
                }

                return {
                    type: 'Xray',
                    name: t.examination,
                    charges: t.amount,
                    doctor: data.doctorName,
                    details: sType
                };
            });

            const billData: UniversalBillData = {
                patientInfo: { ...patientData, uhid: finalUHID },
                registrationId: registrationId,
                date: data.dateOfAppointment,
                time: format(data.dateOfAppointment, 'hh:mm a'),
                referredBy: data.doctorName,
                discount: data.discount,
                services: serviceItems,
                paymentEntries: data.payments.map(p => ({
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
                const examNameList = data.xrayTests.map((t: any) => t.examination).join(", ");

                await sendXrayWhatsAppNotification(
                    contactNumber,
                    patientData.name,
                    data.billNumber || "Pending",
                    data.dateOfAppointment,
                    examNameList,
                    { total: totalAmount, paid: totalPaid, balance: remainingAmount }
                );
            }

            alert(`X-ray Registration successful (ID: ${registrationId}) ✅`);

            // 5. 🟢 CLEAR FORM: Reset the form fields managed by react-hook-form.
            reset({
                ...defaultRHFValues,
                xrayTests: [{ examination: "", amount: 0 }], // Keep one empty test field, or use [] to clear completely
                payments: [],
                discount: 0,
            });

            // Call the onSuccess callback (which should clear the main patientData and commonRegDetails in the parent)
            onSuccess();

        } catch (err: any) {
            console.error("Unexpected error:", err);
            alert(err.message ?? "An unexpected error occurred during X-ray submission.");
        }
    }


    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex items-center justify-between p-3 bg-white rounded-t-lg border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 flex items-center"><Stethoscope className="mr-2 h-6 w-6 text-green-600" />X-ray Services</h3>
                <Button type="submit" disabled={isSubmitting || !isExistingPatient} className="bg-green-600 hover:bg-green-700">
                    {isSubmitting ? "Submitting..." : "Submit X-ray Order"}
                </Button>
            </div>

            <div className="p-3 space-y-3">
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-700 mb-3">Registration & Visit Details</h2>
                    <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3"><Label className="text-sm">Hospital</Label>
                            <Select value={watch("hospitalName")} onValueChange={(v) => setValue("hospitalName", v)} disabled={!isExistingPatient}><SelectTrigger className={`h-8`}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Cigma Clinic">Cigma Clinic</SelectItem><SelectItem value="Gautami Medford NX Hospital">Gautami Medford NX Hospital</SelectItem><SelectItem value="Apex Clinic">Apex Clinic</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
                        <div className="col-span-4 relative"><Label className="text-sm">Doctor Name</Label>
                            <Input {...control.register("doctorName", { required: "Doctor is required" })} className="h-8" placeholder="Referring Doctor" disabled={!isExistingPatient} />
                            {errors.doctorName && <p className="text-red-500 text-xs mt-1">{errors.doctorName.message}</p>}</div>
                        <div className="col-span-2"><Label className="text-sm">Appt Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-8 py-0 px-2 text-sm", !watch("dateOfAppointment") && "text-muted-foreground")} disabled={!isExistingPatient}><CalendarDays className="mr-1 h-4 w-4" />{watch("dateOfAppointment") && typeof watch("dateOfAppointment") === 'object' ? (<span className="truncate">{format(watch("dateOfAppointment"), "PPP")}</span>) : (<span>Pick date</span>)}</Button></PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={watch("dateOfAppointment")} onSelect={(date) => setValue("dateOfAppointment", date || new Date())} initialFocus /></PopoverContent></Popover></div>
                        <div className="col-span-2"><Label className="text-sm">Bill No.</Label><Input type="text" placeholder="Bill number" {...control.register("billNumber")} className="h-8" disabled={!isExistingPatient} /></div>
                        <div className="col-span-1"><Label className="text-sm">Visit</Label>
                            <Select value={watch("visitType")} onValueChange={(v) => setValue("visitType", v as any)} disabled={!isExistingPatient} ><SelectTrigger className={`h-8 ${!isExistingPatient ? "bg-gray-100" : ""}`}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="direct">Direct</SelectItem><SelectItem value="opd" disabled={!isExistingPatient}>OPD</SelectItem><SelectItem value="ipd" disabled={!isExistingPatient}>IPD</SelectItem></SelectContent></Select>
                            {(watch("sourceOpdId") !== null || watch("sourceIpdId") !== null) && (<p className="text-xs text-green-600 mt-1 font-medium">ID: {watch("sourceOpdId") ?? watch("sourceIpdId")}</p>)}</div>
                        <div className="col-span-1"><Label className="text-sm">Type</Label>
                            <Select value={watch("tpa") === true ? "Yes" : "No"} onValueChange={(v) => setValue("tpa", v === "Yes")} disabled={!isExistingPatient}>
                                <SelectTrigger className="h-8"><SelectValue placeholder="Normal/TPA" /></SelectTrigger>
                                <SelectContent><SelectItem value="No">Normal</SelectItem><SelectItem value="Yes">TPA</SelectItem></SelectContent></Select></div>
                        <div className="col-span-12 mt-2"><Label className="text-sm">Remark</Label><Input type="text" placeholder="Enter any additional remarks" {...control.register("remark")} className="h-8" disabled={!isExistingPatient} /></div>
                        <div className="col-span-12 mt-2 flex items-center h-8"><Checkbox checked={watch("sendWhatsApp")} onCheckedChange={(v) => setValue("sendWhatsApp", !!v)} id="xray-whatsapp-checkbox" disabled={!isExistingPatient} />
                            <Label htmlFor="xray-whatsapp-checkbox" className="text-sm cursor-pointer ml-2 flex items-center gap-1"><span className="text-green-600">📱</span>Send WhatsApp SMS</Label></div>
                    </div>
                </div>

                <div className="bg-white p-1 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center px-2 pt-2">
                        <h3 className="text-lg font-semibold text-gray-700">Tests Selection</h3>
                        <Button type="button" onClick={handleAddTest} className="bg-green-600 hover:bg-green-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-colors duration-200 h-7" disabled={!isExistingPatient}><Plus className="mr-1 h-3 w-3" /> Add Test</Button>
                    </div>
                    <div className="p-2 space-y-2">
                        {xrayTestFields.map((field, index) => {
                            const filteredExams = getFilteredExaminations(index);
                            return (
                                <div key={field.id} className="relative grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md shadow-sm border border-gray-200">
                                    {xrayTestFields.length > 1 && (<Button type="button" onClick={() => handleRemoveTest(index)} className="absolute top-1 right-1 p-1 h-5 w-5 text-red-500 hover:bg-red-100" variant="ghost" title="Remove Test" disabled={!isExistingPatient}><X className="w-2 h-2" /></Button>)}
                                    <div className="flex flex-col">
                                        <Label className="text-xs font-semibold text-gray-700 mb-1"> Examination </Label>
                                        <Select value={watch(`xrayTests.${index}.examination`)} onValueChange={(value) => handleTestSelectChange(index, value)} disabled={!isExistingPatient}>
                                            <SelectTrigger className="p-2 h-8 border border-gray-300"> <SelectValue placeholder="Select Examination" /> </SelectTrigger>
                                            <SelectContent className="max-h-[300px] overflow-y-auto">
                                                <div className="sticky top-0 bg-white border-b border-gray-200 p-1 z-20"><Input ref={(el) => { searchInputRefs.current[index] = el }} type="text" placeholder="Search examinations..." value={searchTerms[index] || ""} onChange={(e) => handleSearchChange(index, e.target.value)} className="h-8 text-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} autoComplete="off" disabled={!isExistingPatient} /></div>
                                                {filteredExams.regular.length > 0 && (<div className="px-2 py-1"><div className="text-xs font-semibold text-gray-500">Regular</div>
                                                    {filteredExams.regular.map((exam) => (<SelectItem key={exam} value={exam} className="text-sm">{exam}</SelectItem>))} </div>)}
                                                {filteredExams.procedures.length > 0 && (<div className="px-2 py-1"><div className="text-xs font-semibold text-gray-500">Procedures</div>
                                                    {filteredExams.procedures.map((exam) => (<SelectItem key={exam} value={exam} className="text-sm">{exam}</SelectItem>))} </div>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col">
                                        <Label className="text-xs font-semibold text-gray-700 mb-1"> Amount (₹) </Label>
                                        <Input type="number" value={watch(`xrayTests.${index}.amount`)} readOnly className="h-8 bg-gray-100 cursor-not-allowed" disabled={!isExistingPatient} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-semibold text-gray-700">Payment Details</h3><Button type="button" variant="outline" size="sm" onClick={() => appendPayment({ amount: 0, paymentMode: "Cash", time: new Date().toISOString() })} disabled={!isExistingPatient}><Plus className="h-4 w-4 mr-1" /> Add Payment</Button></div>
                        <div className="mb-3"><Label className="text-sm">Discount (₹)</Label><Input type="number" step="0.01" {...control.register("discount", { valueAsNumber: true })} placeholder="0" className="h-8" disabled={!isExistingPatient} /></div>
                        <div className="space-y-2">
                            {paymentFields.length === 0 ? (<div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>) : (
                                paymentFields.map((field, idx) => (<div key={field.id} className="border rounded-lg p-2 bg-gray-50">
                                    <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Payment {idx + 1}</span><Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePayment(idx)} disabled={!isExistingPatient}> <Trash2 className="h-3 w-3 text-red-500" /> </Button></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div> <Label className="text-xs">Amount (₹)</Label> <Input type="number" step="0.01" {...control.register(`payments.${idx}.amount` as `payments.${number}.amount`, { valueAsNumber: true })} className="h-8" placeholder="0" disabled={!isExistingPatient} /> </div>
                                        <div> <Label className="xs">Mode</Label>
                                            <Select value={watch(`payments.${idx}.paymentMode`)} onValueChange={(v) => setValue(`payments.${idx}.paymentMode` as `payments.${number}.paymentMode`, v as any)} disabled={!isExistingPatient}>
                                                <SelectTrigger className="h-8"> <SelectValue /> </SelectTrigger>
                                                <SelectContent><SelectItem value="Online">Online</SelectItem> <SelectItem value="Cash">Cash</SelectItem></SelectContent></Select></div></div></div>))
                            )}
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border">
                        <h3 className="text-lg font-semibold text-gray-700">Payment Summary</h3>
                        <div className="space-y-2 mb-3">
                            <div className="flex justify-between"><span>Total Amount:</span><span className="font-medium">₹{totalAmount.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Discount:</span><span className="font-medium">₹{discount.toFixed(2)}</span></div>
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

export default XrayRegistration;