// app/pathology/patient-entry/XrayRegistration.tsx
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

// Import types from the parent file
import type { IUnifiedFormInput, VisitType, TpaType } from "./page"

// --- Helpers and Constants (Defined or placeholder for function calls) ---
const TABLE = { PATIENT: "patient_detail", XRAY: "x-raydetail" } as const;

// Minimal type definitions required for this component
interface PatientData { uhid: string; name: string; contact: string; age: number; dayType: "year" | "month" | "day"; title: string; address?: string; gender: string; }
interface CommonRegDetails { hospitalName: string; visitType: VisitType; doctorName: string; tpa: TpaType; registrationDate: string; registrationTime: string; sendWhatsApp: boolean; sourceOpdId: number | null; sourceIpdId: number | null; }
interface XrayData { billNumber: string; remark: string; dateOfAppointment: Date; xrayTests: any[]; discount: number; payments: any[]; }

// Combined RHF interface for this component (FIXED: inherits XrayData directly)
interface XrayRegFormFields extends CommonRegDetails, XrayData {}

// Helper implementation placeholders
function throwIfError(error: any) { if (error) throw error; }
function calculateDOB(age: number, unit: 'year' | 'month' | 'day'): string { return new Date().toISOString().split('T')[0]; }
const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => { return fn() }

// Dummy X-ray data maps (must match your environment)
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


// --- Component Interfaces ---

interface XrayProps {
    patientData: PatientData;
    isExistingPatient: boolean;
    doctorList: any[];
    xrayData: XrayData;
    setXrayData: (data: XrayData) => void;
    commonRegDetails: CommonRegDetails;
    setCommonRegDetails: (key: keyof CommonRegDetails, value: any) => void;
    opdRecords: any[]; ipdRecords: any[];
    showSourceSelection: boolean; setShowSourceSelection: React.Dispatch<React.SetStateAction<boolean>>;
    fetchSourceRecords: (uhid: string, visitType: 'opd' | 'ipd', autoOpen: boolean) => Promise<void>;
}


const XrayRegistration: React.FC<XrayProps> = ({ 
    patientData, isExistingPatient, 
    xrayData, setXrayData,
    commonRegDetails, setCommonRegDetails,
    fetchSourceRecords, setShowSourceSelection,
}) => {
    
    // 1. Initialize RHF with combined data
    const defaultRHFValues: XrayRegFormFields = useMemo(() => ({
        ...commonRegDetails,
        ...xrayData,
    }), [commonRegDetails, xrayData]);

    const { 
        control, watch, setValue, handleSubmit, 
        formState: { isSubmitting, errors },
    } = useForm<XrayRegFormFields>({ defaultValues: defaultRHFValues });

    const watchFields = watch();

    // 2. Sync RHF changes back to parent
    useEffect(() => {
        const { billNumber, remark, dateOfAppointment, xrayTests, discount, payments, ...regDetails } = watchFields;
        
        // Sync Xray Data
        setXrayData({ billNumber, remark, dateOfAppointment, xrayTests, discount, payments });

        // Sync common Registration Details back to parent's RHF
        (Object.keys(regDetails) as Array<keyof CommonRegDetails>).forEach((key) => {
             setCommonRegDetails(key, regDetails[key]); 
        });

    }, [watchFields, setXrayData, setCommonRegDetails]);

    // 3. Field Arrays & Watchers
    // FIXED: Correctly defined name strings for nested fields
    const { fields: xrayTestFields, append: appendXrayTest, remove: removeXrayTest } = useFieldArray({ control, name: "xrayTests" as "xrayTests" });
    const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control, name: "payments" as "payments" });

    // FIXED: Correctly watch nested fields
    const xrayTests = watch("xrayTests");
    const discount = watch("discount") || 0;
    const payments = watch("payments") || [];
    const watchVisitType = watch("visitType");
    const isGautamiHospital = watch("hospitalName") === "Gautami Medford NX Hospital";

    // Local state for X-ray specific search terms
    const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
    const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    // 4. Calculation and Visit Logic
    const getCurrentDataMaps = useCallback(() => {
        if (isGautamiHospital) { return { examinationMap: gautamiExaminationPriceMap, procedureMap: gautamiProcedureList, regularExams: gautamiRegularExaminations, procedureExams: gautamiProcedureExaminations } }
        return { examinationMap: examinationPriceMap, procedureMap: procedurePriceMap, regularExams: regularExaminations, procedureExams: procedureExaminations }
    }, [isGautamiHospital]);

    const isProcedureExamination = (examination: string) => {
        const { procedureExams } = getCurrentDataMaps()
        return procedureExams.includes(examination)
    }

    // FIXED: Calculate total amounts safely
    const totalAmount = xrayTests.reduce((s: number, test: any) => s + (test.amount || 0), 0);
    const totalPaid = payments.reduce((s: number, payment: any) => s + (payment.amount || 0), 0);
    const remainingAmount = totalAmount - discount - totalPaid;

    useEffect(() => {
        if (patientData.uhid && (watchVisitType === 'opd' || watchVisitType === 'ipd')) {
            fetchSourceRecords(patientData.uhid, watchVisitType as 'opd' | 'ipd', true); 
        } else {
            setShowSourceSelection(false);
             if (watchVisitType === 'direct') { setValue("sourceOpdId", null); setValue("sourceIpdId", null); }
        }
    }, [patientData.uhid, watchVisitType, fetchSourceRecords, setShowSourceSelection, setValue]);

    // 5. X-ray Test Handlers (Via removed)
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
        // Ensure correct typing when accessing maps that could be record or array; fix "Element implicitly has an 'any' type..." lint

        let xrayItem: any = undefined;
        let procedureItem: any = undefined;

        // examinationMap and procedureMap could be Record<string, any> or array (for Gautami)
        if (Array.isArray(examinationMap)) {
            xrayItem = examinationMap.find((item: any) => item.Procedure === value);
        } else if (typeof examinationMap === "object" && examinationMap !== null) {
            xrayItem = (examinationMap as Record<string, any>)[value];
        }

        if (Array.isArray(procedureMap)) {
            procedureItem = procedureMap.find((item: any) => item.Procedure === value);
        } else if (typeof procedureMap === "object" && procedureMap !== null) {
            procedureItem = (procedureMap as Record<string, any>)[value];
        }

        let amount = 0

        // Determine the price to use (removed 'via' selection)
        if (isGautamiHospital) {
            if (xrayItem) { amount = xrayItem.OPD_Amt || 0; }
            else if (procedureItem) { amount = procedureItem.Amount || 0; }
        } else {
            if (xrayItem) { amount = xrayItem.price || 0; }
            else if (procedureItem) { amount = procedureItem.price || 0; }
        }

        newTests[index] = { ...newTests[index], examination: value, amount: amount };
        setValue("xrayTests", newTests);
        setSearchTerms((prev) => ({ ...prev, [index]: "" }))
    }
    
    const handleAddTest = () => { appendXrayTest({ examination: "", amount: 0 }); }
    const handleRemoveTest = (index: number) => { if (xrayTestFields.length > 1) { removeXrayTest(index); } }

    // 6. Submission Handler
    const onSubmit: SubmitHandler<XrayRegFormFields> = async (data) => {
        if (!patientData.uhid || data.xrayTests.length === 0 || !data.xrayTests[0].examination) { alert("Please complete patient details and add at least one X-ray examination."); return; }
        if ((data.visitType === 'opd' && data.sourceOpdId === null) || (data.visitType === 'ipd' && data.sourceIpdId === null)) { alert(`Please select a source ${data.visitType.toUpperCase()} registration.`); return; }

        try {
            const finalUHID: string = patientData.uhid;
            
            // 1. Patient Update
            const dob = calculateDOB(patientData.age, patientData.dayType);
            const totalDay = patientData.age * (patientData.dayType === "year" ? 360 : patientData.dayType === "month" ? 30 : 1);
            await withRetry(async () => supabase.from(TABLE.PATIENT).update({ name: patientData.name.toUpperCase(), number: Number(patientData.contact), age: patientData.age, age_unit: patientData.dayType, total_day: totalDay, gender: patientData.gender, address: patientData.address || "", title: patientData.title, dob: dob, }).eq("uhid", finalUHID));
            
            // 2. X-ray Insertion
            const amountDetail = { totalAmount: totalAmount, discount: data.discount, paymentHistory: data.payments.map((p: any) => ({ amount: p.amount, paymentMode: p.paymentMode.toLowerCase(), time: new Date().toISOString() })) };
            const xrayDetail = data.xrayTests.map((test: any) => ({ Examination: test.examination, Xray_Via: "N/A", Amount: test.amount, })); // Xray_Via set to N/A
            
            const dataToInsert = { patient_uhid: finalUHID, created_at: data.dateOfAppointment.toISOString(), "Hospital_name": data.hospitalName,
                bill_number: data.billNumber || null, "Refer_doctorname": data.doctorName || null, "Visit_type": data.visitType.replace('direct', 'Direct').toUpperCase(),
                "Tpa": data.tpa ? 'Yes' : 'No', "Remark": data.remark || null, "x-ray_detail": xrayDetail, amount_detail: amountDetail,
            };

            const result = await withRetry(async () => supabase.from(TABLE.XRAY).insert(dataToInsert));
            if (result.error) throw result.error;

            alert(`X-ray Registration successful ✅`);

            // 3. Reset service-specific fields
            const defaultXray = { billNumber: "", remark: "", dateOfAppointment: new Date(), xrayTests: [{ examination: "", amount: 0 }], discount: 0, payments: [] };
            setXrayData(defaultXray);
            // Reset RHF internal state for service-specific fields
            setValue("billNumber", defaultXray.billNumber);
            setValue("remark", defaultXray.remark);
            setValue("dateOfAppointment", defaultXray.dateOfAppointment);
            setValue("xrayTests", defaultXray.xrayTests);
            setValue("discount", defaultXray.discount);
            setValue("payments", defaultXray.payments);

        } catch (err: any) {
            console.error("Unexpected error:", err);
            alert(err.message ?? "An unexpected error occurred during X-ray submission.");
        }
    }


    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex items-center justify-between p-3 bg-white rounded-t-lg border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 flex items-center"><Stethoscope className="mr-2 h-6 w-6 text-green-600" />X-ray Services</h3>
                <Button type="submit" disabled={isSubmitting || !patientData.uhid} className="bg-green-600 hover:bg-green-700">
                    {isSubmitting ? "Submitting..." : "Submit X-ray Order"}
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
                        <div className="col-span-2"><Label className="text-sm">Appt Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-8 py-0 px-2 text-sm", !watch("dateOfAppointment") && "text-muted-foreground")}><CalendarDays className="mr-1 h-4 w-4" />{watch("dateOfAppointment") && typeof watch("dateOfAppointment") === 'object' ? (<span className="truncate">{format(watch("dateOfAppointment"), "PPP")}</span>) : (<span>Pick date</span>)}</Button></PopoverTrigger>
                            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={watch("dateOfAppointment")} onSelect={(date) => setValue("dateOfAppointment", date || new Date())} initialFocus/></PopoverContent></Popover></div>
                        <div className="col-span-2"><Label className="text-sm">Bill No.</Label><Input type="text" placeholder="Bill number" {...control.register("billNumber")} className="h-8"/></div>
                        <div className="col-span-1"><Label className="text-sm">Visit</Label>
                        <Select value={watch("visitType")} onValueChange={(v) => setValue("visitType", v as any)} disabled={!isExistingPatient} ><SelectTrigger className={`h-8 ${isExistingPatient ? "" : "bg-gray-100"}`}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="direct">Direct</SelectItem><SelectItem value="opd" disabled={!isExistingPatient}>OPD</SelectItem><SelectItem value="ipd" disabled={!isExistingPatient}>IPD</SelectItem></SelectContent></Select>
                         {(watch("sourceOpdId") !== null || watch("sourceIpdId") !== null) && (<p className="text-xs text-green-600 mt-1 font-medium">ID: {watch("sourceOpdId") ?? watch("sourceIpdId")}</p>)}</div>
                        <div className="col-span-1"><Label className="text-sm">Type</Label>
                        <Select value={watch("tpa") === true ? "Yes" : "No"} onValueChange={(v) => setValue("tpa", v === "Yes")}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Normal/TPA" /></SelectTrigger>
                            <SelectContent><SelectItem value="No">Normal</SelectItem><SelectItem value="Yes">TPA</SelectItem></SelectContent></Select></div>
                        <div className="col-span-12 mt-2"><Label className="text-sm">Remark</Label><Input type="text" placeholder="Enter any additional remarks" {...control.register("remark")} className="h-8"/></div>
                        <div className="col-span-12 mt-2 flex items-center h-8"><Checkbox checked={watch("sendWhatsApp")} onCheckedChange={(v) => setValue("sendWhatsApp", !!v)} id="xray-whatsapp-checkbox" />
                            <Label htmlFor="xray-whatsapp-checkbox" className="text-sm cursor-pointer ml-2 flex items-center gap-1"><span className="text-green-600">📱</span>Send WhatsApp SMS</Label></div>
                    </div>
                </div>
                {/* X-ray Test Selection (Via removed) */}
                <div className="bg-white p-1 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center px-2 pt-2">
                        <h3 className="text-lg font-semibold text-gray-700">Tests Selection</h3>
                        <Button type="button" onClick={handleAddTest} className="bg-green-600 hover:bg-green-700 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-colors duration-200 h-7"><Plus className="mr-1 h-3 w-3" /> Add Test</Button>
                    </div>
                    <div className="p-2 space-y-2">
                        {xrayTestFields.map((field, index) => {
                            const filteredExams = getFilteredExaminations(index);
                            return (
                                <div key={field.id} className="relative grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md shadow-sm border border-gray-200">
                                    {xrayTestFields.length > 1 && (<Button type="button" onClick={() => handleRemoveTest(index)} className="absolute top-1 right-1 p-1 h-5 w-5 text-red-500 hover:bg-red-100" variant="ghost" title="Remove Test"><X className="w-2 h-2" /></Button>)}
                                    {/* Examination Dropdown */}
                                    <div className="flex flex-col">
                                        <Label className="text-xs font-semibold text-gray-700 mb-1"> Examination </Label>
                                        <Select value={watch(`xrayTests.${index}.examination`)} onValueChange={(value) => handleTestSelectChange(index, value)}>
                                            <SelectTrigger className="p-2 h-8 border border-gray-300"> <SelectValue placeholder="Select Examination" /> </SelectTrigger>
                                            <SelectContent className="max-h-[300px] overflow-y-auto">
                                                <div className="sticky top-0 bg-white border-b border-gray-200 p-1 z-20"><Input ref={(el) => { searchInputRefs.current[index] = el }} type="text" placeholder="Search examinations..." value={searchTerms[index] || ""} onChange={(e) => handleSearchChange(index, e.target.value)} className="h-8 text-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} autoComplete="off"/></div>
                                                {filteredExams.regular.length > 0 && (<div className="px-2 py-1"><div className="text-xs font-semibold text-gray-500">Regular</div>
                                                    {filteredExams.regular.map((exam) => (<SelectItem key={exam} value={exam} className="text-sm">{exam}</SelectItem>))} </div>)}
                                                {filteredExams.procedures.length > 0 && (<div className="px-2 py-1"><div className="text-xs font-semibold text-gray-500">Procedures</div>
                                                    {filteredExams.procedures.map((exam) => (<SelectItem key={exam} value={exam} className="text-sm">{exam}</SelectItem>))} </div>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col">
                                        <Label className="text-xs font-semibold text-gray-700 mb-1"> Amount (₹) </Label>
                                        <Input type="number" value={watch(`xrayTests.${index}.amount`)} readOnly className="h-8 bg-gray-100 cursor-not-allowed" />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Payment Section */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-semibold text-gray-700">Payment Details</h3><Button type="button" variant="outline" size="sm" onClick={() => appendPayment({ amount: 0, paymentMode: "Cash", time: new Date().toISOString() })}><Plus className="h-4 w-4 mr-1" /> Add Payment</Button></div>
                        <div className="mb-3"><Label className="text-sm">Discount (₹)</Label><Input type="number" step="0.01" {...control.register("discount", { valueAsNumber: true })} placeholder="0" className="h-8" /></div>
                        <div className="space-y-2">
                            {paymentFields.length === 0 ? (<div className="text-center py-4 text-gray-500 text-sm">No payments added yet</div>) : (
                                paymentFields.map((field, idx) => (<div key={field.id} className="border rounded-lg p-2 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Payment {idx + 1}</span><Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePayment(idx)} > <Trash2 className="h-3 w-3 text-red-500" /> </Button></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div> <Label className="text-xs">Amount (₹)</Label> <Input type="number" step="0.01" {...control.register(`payments.${idx}.amount` as `payments.${number}.amount`, { valueAsNumber: true })} className="h-8" placeholder="0" /> </div>
                                            <div> <Label className="xs">Mode</Label>
                                                <Select value={watch(`payments.${idx}.paymentMode`)} onValueChange={(v) => setValue(`payments.${idx}.paymentMode` as `payments.${number}.paymentMode`, v as any)} >
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