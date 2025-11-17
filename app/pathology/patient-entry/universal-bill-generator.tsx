// @/app/opd/universal-bill-generator.tsx
"use client"

import { jsPDF } from "jspdf"
import { format } from "date-fns"
import { toWords } from "number-to-words"
import { Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"

// --- Helper Types for Universal Bill ---

// Common patient info fields used by the bill generator
export interface PatientBillInfo {
    uhid: string; 
    name: string; 
    contact: string; 
    age: number; 
    dayType: "year" | "month" | "day"; 
    gender: string; 
    address?: string; 
    title: string;
}

// Doctor list for lookup
export interface DoctorLite {
    id: number | string
    doctor_name: string
}

// Service item for the bill table
export interface BillServiceItem {
    type: 'Pathology' | 'Xray' | 'Sonography' | 'OPD' | 'Custom';
    name: string;
    charges: number;
    doctor?: string; // Doctor name or ID relevant to this specific service
    details?: string; // Optional extra details (e.g., test type, visit type)
}

// Data structure for payment history (for displaying in bill summary)
export interface PaymentEntry {
    amount: number;
    paymentMode: 'online' | 'cash' | 'card';
    time: string; // ISO string
}

// Input data for the Bill Generator
export interface UniversalBillData {
    patientInfo: PatientBillInfo;
    registrationId: number | null; // The main registration/bill ID
    date: Date;
    time: string; // e.g., "12:00 PM"
    referredBy: string; // Main referring doctor for the whole bill
    discount: number;
    services: BillServiceItem[];
    paymentEntries: PaymentEntry[];
    sendWhatsApp: boolean;
}

// Define the arguments for the core PDF generation function
interface GeneratePdfArgs {
    billData: UniversalBillData
    doctors: DoctorLite[]
}

// --- Core PDF Generation Logic ---

// Core function to generate the jsPDF document
async function generatePdfDocument({ billData, doctors }: GeneratePdfArgs): Promise<jsPDF> {
    const { patientInfo, registrationId, date, time, referredBy, discount, services, paymentEntries } = billData;
    
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    // Try letterhead
    try {
        const img = new Image()
        img.crossOrigin = "anonymous"
        await new Promise((res, rej) => {
            img.onload = res
            img.onerror = rej
            img.src = "/letterhead.png"
        })
        doc.addImage(img, "PNG", 0, 0, pageWidth, pageHeight)
    } catch (e) {
        console.warn("Letterhead image not loaded:", e)
    }

    // Helper to get doctor name from ID (if applicable, though we mostly use names now)
    const getDoctorName = (doctorIdentifier: string | number): string => {
        if (!doctorIdentifier) return "-"
        if (typeof doctorIdentifier === 'number') {
            const doc = doctors.find((d) => d.id === doctorIdentifier)
            return doc ? String(doc.doctor_name) : String(doctorIdentifier)
        }
        return String(doctorIdentifier); // Assume string is already the name
    }

    let yPos = 53
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.text(
        `Date: ${format(date, "dd/MM/yyyy")} | Time: ${time}`,
        pageWidth - 20,
        yPos,
        { align: "right" }
    )
    yPos += 8

    // Bill Number and UHID display
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text(`Registration ID (Bill No): ${String(registrationId || 'N/A')}`, 20, yPos);
    doc.text(`UHID: ${patientInfo.uhid || '-'}`, 20, yPos + 5);
    yPos += 10;


    // Patient Info header
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 248, 255)
    doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
    doc.text("PATIENT INFORMATION", 22, yPos + 2)
    yPos += 10

    // Patient Info columns (parallel)
    const leftX = 22
    const rightX = pageWidth / 2 + 20
    let leftColY = yPos

    // Name (Left)
    doc.setFont("helvetica", "bold")
    doc.text("Name:", leftX, leftColY)
    doc.setFont("helvetica", "normal")
    doc.text(`${patientInfo.title} ${patientInfo.name}`, leftX + 18, leftColY)

    // Phone (Right)
    doc.setFont("helvetica", "bold")
    doc.text("Phone:", rightX, leftColY)
    doc.setFont("helvetica", "normal")
    doc.text(String(patientInfo.contact), rightX + 18, leftColY)

    leftColY += 5

    // Age (Left)
    doc.setFont("helvetica", "bold")
    doc.text("Age:", leftX, leftColY)
    doc.setFont("helvetica", "normal")
    doc.text(
        `${String(patientInfo.age ?? "-")} ${String(patientInfo.dayType || "years")}`,
        leftX + 18,
        leftColY
    )

    // Gender (Right)
    doc.setFont("helvetica", "bold")
    doc.text("Gender:", rightX, leftColY)
    doc.setFont("helvetica", "normal")
    doc.text(
        patientInfo.gender ? String(patientInfo.gender.charAt(0).toUpperCase() + patientInfo.gender.slice(1)) : "-",
        rightX + 18,
        leftColY
    )

    leftColY += 5

    // Address (Left)
    if (patientInfo.address) {
        doc.setFont("helvetica", "bold")
        doc.text("Address:", leftX, leftColY)
        doc.setFont("helvetica", "normal")
        const addressText = String(patientInfo.address.length > 30 ? `${patientInfo.address.slice(0, 30)}...` : patientInfo.address);
        doc.text(addressText, leftX + 18, leftColY);
    }
    
    // Referred By (Right)
    doc.setFont("helvetica", "bold")
    doc.text("Referred By:", rightX, leftColY)
    doc.setFont("helvetica", "normal")
    doc.text(String(referredBy), rightX + 25, leftColY)
    
    leftColY += 5
    yPos = leftColY + 5 // Take the max of updated Y positions for patient info

    // Table header
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(204, 229, 255);
    doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
    doc.text("No.", 22, yPos + 1)
    doc.text("Modality/Service", 32, yPos + 1)
    doc.text("Service Details", 70, yPos + 1)
    doc.text("Doctor/Specialist", 125, yPos + 1)
    doc.text("Charges (Rs.)", pageWidth - 22, yPos + 1, { align: "right" })
    yPos += 7

    doc.setFont("helvetica", "normal")
    let totalCharges = 0

    services.forEach((m: BillServiceItem, i: number) => {
        if (yPos > pageHeight - 50) {
            doc.addPage()
            try {
                const newImg = new Image()
                newImg.crossOrigin = "anonymous"
                new Promise((res) => { newImg.onload = res; newImg.src = "/letterhead.png"; })
                doc.addImage(newImg, "PNG", 0, 0, pageWidth, pageHeight)
            } catch { }
            yPos = 30
            doc.setFontSize(8)
            doc.setFont("helvetica", "bold")
            doc.setFillColor(220, 220, 220)
            doc.rect(20, yPos - 2, pageWidth - 40, 5, "F")
            doc.text("No.", 22, yPos + 1)
            doc.text("Modality/Service", 32, yPos + 1)
            doc.text("Service Details", 70, yPos + 1)
            doc.text("Doctor/Specialist", 125, yPos + 1)
            doc.text("Charges (Rs.)", pageWidth - 22, yPos + 1, { align: "right" })
            yPos += 7
            doc.setFont("helvetica", "normal")
        }

        if (i % 2 === 0) {
            doc.setFillColor(250, 250, 250)
            doc.rect(20, yPos - 1, pageWidth - 40, 4, "F")
        }

        const modalityType = String(m.type.charAt(0).toUpperCase() + m.type.slice(1))
        const serviceName = m.name.length > 35 ? `${m.name.slice(0, 35)}…` : m.name;
        const doctorInfo = m.doctor ? `Dr. ${getDoctorName(m.doctor)}` : "-";
        const amt = Number(m.charges) || 0
        
        doc.text(String(i + 1), 22, yPos + 1)
        doc.text(modalityType, 32, yPos + 1)
        doc.text(serviceName, 70, yPos + 1)
        doc.text(doctorInfo.length > 25 ? `${doctorInfo.slice(0, 25)}…` : doctorInfo, 125, yPos + 1)
        doc.text(`Rs. ${amt.toFixed(2)}`, pageWidth - 22, yPos + 1, { align: "right" })
        totalCharges += amt
        yPos += 4
    })
    yPos += 7

    // Payment summary
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(240, 248, 255)
    doc.rect(20, yPos - 2, pageWidth - 40, 6, "F")
    doc.text("PAYMENT SUMMARY", 22, yPos + 2)
    yPos += 10
    
    const totalPaid = paymentEntries.reduce((sum, p) => sum + (p.amount || 0), 0);
    const net = totalCharges - discount
    const due = net - totalPaid
    const sx = pageWidth - 70

    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text("Total Charges:", sx - 35, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(`Rs. ${totalCharges.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 4

    if (discount > 0) {
        doc.setFont("helvetica", "bold")
        doc.setTextColor(200, 0, 0)
        doc.text("Discount:", sx - 35, yPos)
        doc.setFont("helvetica", "normal")
        doc.text(`Rs. ${discount.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
        doc.setTextColor(0, 0, 0)
        yPos += 4
    }

    doc.setDrawColor(0, 0, 0)
    doc.line(sx - 35, yPos, pageWidth - 20, yPos)
    yPos += 3

    doc.setFont("helvetica", "bold")
    doc.text("Net Amount:", sx - 35, yPos)
    doc.text(`Rs. ${net.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 5
    
    // Paid breakdown
    doc.setFont("helvetica", "normal")
    const paymentModes = paymentEntries.reduce((acc, p) => {
        const mode = p.paymentMode.charAt(0).toUpperCase() + p.paymentMode.slice(1);
        acc[mode] = (acc[mode] || 0) + (p.amount || 0);
        return acc;
    }, {} as Record<string, number>);

    Object.entries(paymentModes).forEach(([mode, amount]) => {
        doc.text(`${mode} Paid:`, sx - 35, yPos)
        doc.text(`Rs. ${amount.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
        yPos += 5
    });

    doc.setFont("helvetica", "bold")
    doc.text("Total Paid:", sx - 35, yPos)
    doc.text(`Rs. ${totalPaid.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
    yPos += 5

    // Due amount
    if (due > 0) {
        doc.setFont("helvetica", "bold")
        doc.setTextColor(200, 0, 0)
        doc.text("Due Amount:", sx - 35, yPos)
        doc.text(`Rs. ${due.toFixed(2)}`, pageWidth - 22, yPos, { align: "right" })
        doc.setTextColor(0, 0, 0)
        yPos += 5
    }

    // Amounts in words
    doc.setFontSize(9)
    doc.setFont("helvetica", "italic")
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    yPos += 5
    doc.text(`Total Paid (in words): ${capitalize(toWords(totalPaid))} only`, 20, yPos)
    yPos += 5
    if (due > 0) {
        doc.text(`Due Amount (in words): ${capitalize(toWords(due))} only`, 20, yPos)
        yPos += 5
    }
    
    // Add signature/footer text
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    // doc.text("This is an auto-generated bill and may not require a signature.", 20, pageHeight - 15)
    doc.setFont("helvetica", "bold")
    // doc.text("For: Sigma Clinic", pageWidth - 40, pageHeight - 15)


    return doc
}

// --- React Component and Programmatic Utility ---

interface UniversalBillGeneratorProps {
    billData: UniversalBillData
    doctors?: DoctorLite[]
    className?: string
}

export function UniversalBillGenerator({ billData, doctors = [], className = "" }: UniversalBillGeneratorProps) {

    // Function to generate and download PDF
    const downloadPDF = async () => {
        const doc = await generatePdfDocument({ billData, doctors });
        const fileName = `Bill_${String(billData.patientInfo.name).replace(/\s+/g, "_")}__${format(billData.date, "ddMMyyyy")}.pdf`
        doc.save(fileName)
    }

    // Function to generate PDF and view in new tab
    const viewPDF = async () => {
        const doc = await generatePdfDocument({ billData, doctors });
        const pdfBlob = doc.output("blob")
        const blobUrl = URL.createObjectURL(pdfBlob)

        const newWindow = window.open(blobUrl, "_blank")
        if (newWindow) {
            newWindow.focus()
            setTimeout(() => { URL.revokeObjectURL(blobUrl) }, 1000) // Revoke after a short delay
        } else {
            console.error("Failed to open new window. Pop-ups might be blocked.");
            URL.revokeObjectURL(blobUrl); // Revoke immediately if popup blocked
        }
    }

    return (
        <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={viewPDF} className={`gap-2 ${className}`}>
                <Eye className="h-4 w-4" /> View Bill
            </Button>
            <Button type="button" variant="outline" onClick={downloadPDF} className={`gap-2 ${className}`}>
                <Download className="h-4 w-4" /> Download Bill
            </Button>
        </div>
    )
}

// Utility function for opening in new tab programmatically (export for page.tsx)
export async function openUniversalBillInNewTabProgrammatically(billData: UniversalBillData, doctors: DoctorLite[] = []) {
    try {
        const doc = await generatePdfDocument({ billData, doctors });
        const pdfBlob = doc.output("blob")
        const blobUrl = URL.createObjectURL(pdfBlob)

        const newWindow = window.open(blobUrl, "_blank")
        if (newWindow) {
            newWindow.focus()
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000); // Revoke after 30 seconds
        } else {
            throw new Error("Failed to open new window. Pop-ups might be blocked.");
        }
    } catch (error) {
        console.error("Error in openUniversalBillInNewTabProgrammatically:", error);
        throw error; // Re-throw to be caught by the calling function (Pathology/XrayRegistration)
    }
}