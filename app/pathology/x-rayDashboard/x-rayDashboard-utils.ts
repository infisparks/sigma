import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { toWords } from "number-to-words"
import letterhead from "../../../public/bill.png"

export const downloadXrayBill = (data: any) => {
  const img = new Image()
  img.src = letterhead.src
  img.crossOrigin = "anonymous"

  img.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5)

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()

    doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
    doc.setFont("helvetica", "normal").setFontSize(12)

    // Helper to parse JSON data safely
    const parseJSON = (jsonString: string | object) => {
      try {
        if (typeof jsonString === "string") {
          return JSON.parse(jsonString)
        }
        return jsonString
      } catch (error) {
        console.error("Failed to parse JSON:", error)
        return null
      }
    }

    const xrayDetails = parseJSON(data["x-ray_detail"])
    const amountDetails = parseJSON(data.amount_detail)

    const testDetails = xrayDetails && Array.isArray(xrayDetails) ? xrayDetails : []

    const paymentData = Array.isArray(amountDetails) ? amountDetails[0] : amountDetails
    const totalAmount = paymentData?.totalAmount || paymentData?.TotalAmount || 0
    const discount = Number(paymentData?.discount) || Number(paymentData?.Discount) || 0
    const paymentHistory = paymentData?.paymentHistory || []
    const totalPaid = paymentHistory.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    const remainingAmount = Math.max(0, totalAmount - (totalPaid + discount))

    // Set a consistent Y position for the start of content
    let y = 70

    const margin = 14
    const colMid = pageW / 2
    const leftKeyX = margin
    const leftColonX = margin + 40
    const leftValueX = margin + 44
    const rightKeyX = colMid + margin
    const rightColonX = colMid + margin + 40
    const rightValueX = colMid + margin + 44

    // Custom drawRow function from your reference
    const drawRow = (kL: string, vL: string | string[], kR: string, vR: string) => {
      doc.text(kL, leftKeyX, y)
      doc.text(":", leftColonX, y)
      if (Array.isArray(vL)) {
        doc.text(vL, leftValueX, y)
        y += (vL.length - 1) * 6; // Adjust y based on extra lines
      } else {
        doc.text(vL, leftValueX, y)
      }
      doc.text(kR, rightKeyX, y)
      doc.text(":", rightColonX, y)
      doc.text(vR, rightValueX, y)
      y += 6
    }
    
    // Patient and Bill Info
    const fullName = data.name;
    const nameColumnWidth = (pageW / 2 + margin) - leftValueX - 4;
    const nameLines = doc.splitTextToSize(fullName, nameColumnWidth);

    drawRow("Name", nameLines, "Bill No.", data.bill_number || "N/A");
    drawRow("Age / Gender", `${data.age} ${data.age_unit} / ${data.gender || "N/A"}`, "Registration Date", new Date(data.created_at).toLocaleDateString());
    drawRow("Ref. Doctor", data.Refer_doctorname || "N/A", "Contact", data.number || "N/A");

    y += 4

    // X-ray Test Table
    autoTable(doc, {
      head: [["Test Name", "Service", "Amount"]],
      body: testDetails.map((test: any) => [test.Examination, "X-RAY", test.Amount]), // Added Service column with "X-RAY" value
      startY: y,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 11 },
      headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
      columnStyles: { 2: { fontStyle: "bold" } }, // Updated column index for Amount column
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 10

    // Payment Summary Table
    const paymentSummaryRows = [
      ["Test Total", totalAmount.toFixed(2)],
      ["Discount", discount.toFixed(2)],
      ["Amount Paid", totalPaid.toFixed(2)],
      ["Remaining", remainingAmount.toFixed(2)],
    ]

    autoTable(doc, {
        head: [["Description", "Amount"]],
        body: paymentSummaryRows,
        startY: y,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 11 },
        headStyles: { textColor: [0, 0, 0], fontStyle: "bold" }, // No fillColor
        columnStyles: {
          0: { fontStyle: "normal" }, 
          1: { fontStyle: "bold", halign: "left" }, 
        },
        margin: { left: margin, right: margin },
      })
      
    y = (doc as any).lastAutoTable.finalY + 8

    // Remaining amount in words
    const remainingWords = toWords(Math.round(remainingAmount))
    doc.setFontSize(10).text(`(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`, pageW - margin, y, { align: "right" })
    y += 12

    // Thank you message
    doc.setFont("helvetica", "italic")
      .setFontSize(10)
      .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })

    doc.save(`Bill_${data.name}_${data.bill_number}.pdf`)
  }

  img.onerror = () => {
    console.error("Failed to load letterhead image. Please check the path.")
    alert("Failed to load letterhead image.")
  }
}