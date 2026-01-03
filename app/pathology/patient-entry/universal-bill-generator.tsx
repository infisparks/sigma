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

    // CHANGED: A5 Portrait configuration
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    // --- Custom Header Function ---
    const drawHeader = () => {
        // Logo / Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185); // Professional Blue
        doc.text("CIGMA", 15, 15);

        // Subtitle
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(127, 140, 141); // Grey
        doc.text("Clinic and Diagnostic Center", 15, 20);

        // Divider Line
        doc.setDrawColor(41, 128, 185);
        doc.setLineWidth(0.5);
        doc.line(15, 25, pageWidth - 15, 25);

        doc.setTextColor(0, 0, 0); // Reset text color
    };

    // Draw initial header
    drawHeader();

    // Helper to get doctor name from ID
    const getDoctorName = (doctorIdentifier: string | number): string => {
        if (!doctorIdentifier) return "-"
        if (typeof doctorIdentifier === 'number') {
            const doc = doctors.find((d) => d.id === doctorIdentifier)
            return doc ? String(doc.doctor_name) : String(doctorIdentifier)
        }
        return String(doctorIdentifier);
    }

    let yPos = 32; // Start content below the header

    // Date & Time (Top Right relative to header)
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.text(
        `Date: ${format(date, "dd/MM/yyyy")} | Time: ${time}`,
        pageWidth - 15,
        18,
        { align: "right" }
    )

    // Bill Number and UHID display
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text(`Bill No: ${String(registrationId || 'N/A')}`, 15, yPos);
    doc.text(`UHID: ${patientInfo.uhid || '-'}`, 70, yPos);
    yPos += 8;

    // Patient Info header
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(236, 240, 241) // Light grey/blue
    doc.rect(15, yPos - 3, pageWidth - 30, 6, "F")
    doc.text("PATIENT DETAILS", 17, yPos + 1)
    yPos += 8

    // Patient Info columns
    const col1X = 17;
    const col2X = pageWidth / 2 + 5;

    // Row 1
    doc.setFont("helvetica", "bold"); doc.text("Name:", col1X, yPos);
    doc.setFont("helvetica", "normal"); doc.text(`${patientInfo.title} ${patientInfo.name}`, col1X + 18, yPos);

    doc.setFont("helvetica", "bold"); doc.text("Phone:", col2X, yPos);
    doc.setFont("helvetica", "normal"); doc.text(String(patientInfo.contact), col2X + 18, yPos);
    yPos += 5;

    // Row 2
    doc.setFont("helvetica", "bold"); doc.text("Age/Sex:", col1X, yPos);
    doc.setFont("helvetica", "normal");
    const genderStr = patientInfo.gender ? patientInfo.gender.charAt(0).toUpperCase() + patientInfo.gender.slice(1) : "-";
    doc.text(`${String(patientInfo.age ?? "-")} ${String(patientInfo.dayType || "Y")} / ${genderStr}`, col1X + 18, yPos);

    doc.setFont("helvetica", "bold"); doc.text("Ref. By:", col2X, yPos);
    doc.setFont("helvetica", "normal"); doc.text(String(referredBy), col2X + 18, yPos);
    yPos += 5;

    // Row 3 (Address)
    if (patientInfo.address) {
        doc.setFont("helvetica", "bold"); doc.text("Address:", col1X, yPos);
        doc.setFont("helvetica", "normal");
        const addressText = String(patientInfo.address.length > 55 ? `${patientInfo.address.slice(0, 55)}...` : patientInfo.address);
        doc.text(addressText, col1X + 18, yPos);
        yPos += 5;
    }

    yPos += 3; // Spacer

    // Determine layout mode
    const isOPD = services.length > 0 && services.every(s => s.type === 'OPD');

    // Table header helper
    const drawTableHeader = (y: number) => {
        doc.setFontSize(9)
        doc.setFont("helvetica", "bold")
        doc.setFillColor(41, 128, 185); // Professional Blue
        doc.setTextColor(255, 255, 255);
        doc.rect(15, y - 4, pageWidth - 30, 6, "F")

        doc.text("SN", 17, y)
        if (isOPD) {
            doc.text("Physician", 30, y)         // Replaces Service Name
            doc.text("Visit Type", 90, y)        // Replaces Details
        } else {
            doc.text("Service Name", 25, y)
            // Removed Details Column
            // Removed Physician Column for Pathology
        }
        doc.text("Amount", pageWidth - 17, y, { align: "right" })

        doc.setTextColor(0, 0, 0);
    }

    drawTableHeader(yPos);
    yPos += 6;

    doc.setFont("helvetica", "normal")
    let totalCharges = 0

    services.forEach((m: BillServiceItem, i: number) => {
        // Page break logic
        if (yPos > pageHeight - 35) { // Leave space for summary
            doc.addPage()
            drawHeader();
            yPos = 35;
            drawTableHeader(yPos);
            yPos += 6;
            doc.setFont("helvetica", "normal")
        }

        if (i % 2 === 0) {
            doc.setFillColor(242, 243, 244)
            doc.rect(15, yPos - 4, pageWidth - 30, 6, "F")
        }

        // Clean up Doctor Name
        const rawDocName = getDoctorName(m.doctor || "");
        let doctorDisplay = "-";
        if (m.doctor) {
            const nameWithoutPrefix = rawDocName.replace(/^Dr\.?\s*/i, "");
            doctorDisplay = `Dr. ${nameWithoutPrefix}`;
        }

        const amt = Number(m.charges) || 0
        doc.text(String(i + 1), 17, yPos)

        if (isOPD) {
            // OPD Specific Layout
            // Physician Column
            doc.text(doctorDisplay.length > 30 ? `${doctorDisplay.slice(0, 30)}…` : doctorDisplay, 30, yPos);

            // Visit Type (from Details)
            let visitType = m.details || "Consultation";
            if (visitType.length > 20) visitType = visitType.slice(0, 20) + "..";
            doc.text(visitType, 90, yPos);

        } else {
            // Standard Pathology Layout
            let serviceName = m.name;
            // Truncate strings - Expanded for Service Name (Full Width)
            const itemText = serviceName.length > 65 ? `${serviceName.slice(0, 65)}…` : serviceName;

            doc.text(itemText, 25, yPos)
            // Removed Details text
            // Removed Physician text
        }

        doc.text(amt.toFixed(2), pageWidth - 17, yPos, { align: "right" })
        totalCharges += amt
        yPos += 6
    })

    yPos += 2;

    // Check availability for summary
    if (yPos > pageHeight - 40) {
        doc.addPage();
        drawHeader();
        yPos = 35;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 5;

    const totalPaid = paymentEntries.reduce((sum, p) => sum + (p.amount || 0), 0);
    const net = totalCharges - discount
    const due = net - totalPaid

    // Amount in Words
    doc.setFontSize(9)
    doc.setFont("helvetica", "italic")
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

    // Wrap words if too long? usually fits in A5 landscape width
    doc.text(`In Words: ${capitalize(toWords(Math.floor(totalPaid)))} Rupees Only`, 15, yPos + 5)

    const summaryX = pageWidth - 70; // Adjusted for tight portrait width
    const valX = pageWidth - 17;

    doc.setFont("helvetica", "bold")
    doc.text("Total Charges:", summaryX, yPos)
    doc.setFont("helvetica", "normal")
    doc.text(totalCharges.toFixed(2), valX, yPos, { align: "right" })
    yPos += 5;

    if (discount > 0) {
        doc.setFont("helvetica", "bold")
        doc.text("Discount:", summaryX, yPos)
        doc.text(discount.toFixed(2), valX, yPos, { align: "right" })
        yPos += 5;
    }

    doc.setFont("helvetica", "bold")
    doc.text("Net Amount:", summaryX, yPos)
    doc.text(net.toFixed(2), valX, yPos, { align: "right" })
    yPos += 5;

    doc.text("Paid Amount:", summaryX, yPos)
    doc.text(totalPaid.toFixed(2), valX, yPos, { align: "right" })
    yPos += 5;

    if (due > 0) {
        doc.setTextColor(192, 57, 43); // Red
        doc.text("Balance Due:", summaryX, yPos)
        doc.text(due.toFixed(2), valX, yPos, { align: "right" })
        doc.setTextColor(0, 0, 0);
    }

    // Footer
    const footerY = pageHeight - 10;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by CIGMA Clinic System", 15, footerY);

    doc.setFont("helvetica", "bold");
    doc.text("Authorized Signatory", pageWidth - 15, footerY, { align: "right" });

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