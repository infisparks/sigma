"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PurchaseBillProps {
    params: {
        id: string
    }
}

interface PurchaseItem {
    id: string
    medicine_id: string
    batch_number: string
    expiry_date: string
    quantity: number
    pack_size_quantity: number
    mrp: number
    unit_price: number
    total_amount: number
    clinic_medicine: {
        name: string
        pack_size_label: string
    }
}

interface PurchaseInvoice {
    id: string
    invoice_number: string
    invoice_date: string
    total_amount: number
    created_at: string
    pharmacy_vendors: {
        name: string
        contact_person: string
        phone: string
        email: string
        address: string
        gstin: string
    }
}

function numberToWords(num: number): string {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen ']
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

    if ((num = num.toString().length > 9 ? parseFloat(num.toString().substring(0, 9)) : num) === 0) return 'Zero'

    const n = ('000000000' + num.toFixed(2).split('.')[0]).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/)
    if (!n) return ''

    let str = ''
    str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0] as any] + ' ' + a[n[1][1] as any]) + 'Crore ' : ''
    str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0] as any] + ' ' + a[n[2][1] as any]) + 'Lakh ' : ''
    str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0] as any] + ' ' + a[n[3][1] as any]) + 'Thousand ' : ''
    str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0] as any] + ' ' + a[n[4][1] as any]) + 'Hundred ' : ''
    str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0] as any] + ' ' + a[n[5][1] as any]) : ''

    return str.trim()
}

export default function PurchaseBillPage({ params }: PurchaseBillProps) {
    const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null)
    const [items, setItems] = useState<PurchaseItem[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPurchase = async () => {
            if (!params.id) return

            // 1. Fetch Purchase Invoice
            const { data: invData, error: invError } = await supabase
                .from('pharmacy_purchase_invoice')
                .select(`
                    *,
                    pharmacy_vendors (
                        name, contact_person, phone, email, address, gstin
                    )
                `)
                .eq('id', params.id)
                .single()

            if (invError) {
                console.error('Error fetching invoice:', invError)
                setLoading(false)
                return
            }
            setInvoice(invData)

            // 2. Fetch Items
            const { data: itemsData, error: itemsError } = await supabase
                .from('pharmacy_purchase_item')
                .select(`
                    *,
                    clinic_medicine (
                        name,
                        pack_size_label
                    )
                `)
                .eq('purchase_id', params.id)

            if (itemsError) {
                console.error('Error fetching items:', itemsError)
            } else {
                setItems(itemsData || [])
            }

            setLoading(false)
        }

        fetchPurchase()
    }, [params.id])


    if (loading) return <div className="p-10 text-center">Loading Purchase Record...</div>
    if (!invoice) return <div className="p-10 text-center text-red-500">Purchase Record not found</div>

    return (
        <div className="bg-gray-100 min-h-screen flex flex-col items-center py-10 print:bg-white print:p-0">

            {/* Control Panel */}
            <div className="no-print mb-6 w-[210mm] bg-white p-4 rounded-lg shadow flex justify-between items-center">
                <h2 className="font-bold text-lg">Purchase Order Record</h2>
                <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Printer className="w-4 h-4 mr-2" /> Print Record
                </Button>
            </div>

            <style jsx global>{`
                @page { size: A4; margin: 10mm; }
                @media print {
                    body { margin: 0; background: white; -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-container {
                        width: 100% !important;
                        min-height: 100vh;
                        box-shadow: none !important;
                        margin: 0 !important;
                        border: none !important;
                    }
                }
            `}</style>

            {/* Bill Container */}
            <div className="print-container w-[210mm] min-h-[297mm] bg-white text-black p-8 shadow-xl relative text-[11px] leading-tight font-sans border border-gray-200">

                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                    <div className="w-[60%]">
                        <h1 className="text-3xl font-bold uppercase tracking-wide text-slate-900">CICMA CHEMIST</h1>
                        <p className="text-[10px] text-gray-700 mt-1 leading-normal w-[80%]">
                            Ground floor, Virani Plaza, beside Bank of Maharashtra,<br />
                            near Kausa, Tetavli, Kausa, Mumbra, Thane,<br />
                            Maharashtra 400612
                        </p>
                        <p className="text-[10px] font-bold mt-1">GSTIN: 27EAMPK6001D1ZY</p>
                    </div>
                    <div className="w-[40%] text-right space-y-1">
                        <div className="bg-slate-100 p-2 rounded border border-slate-300 inline-block text-left min-w-[200px]">
                            <div className="text-center font-bold border-b border-gray-300 pb-1 mb-1 uppercase text-xs">Goods Receipt Note</div>
                            <div className="flex justify-between"><strong className="mr-2">GRN ID:</strong> <span>#{invoice.id.slice(0, 8).toUpperCase()}</span></div>
                            <div className="flex justify-between"><strong className="mr-2">Entry Date:</strong> <span>{format(new Date(invoice.created_at), 'dd-MM-yyyy')}</span></div>
                        </div>
                    </div>
                </div>

                {/* Vendor Details */}
                <div className="flex justify-between mb-4 border border-gray-300 rounded p-3 bg-gray-50/30">
                    <div className="w-[100%] space-y-1">
                        <div className="text-xs font-bold uppercase text-slate-700 border-b border-gray-200 mb-1 pb-1">Vendor Details</div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="flex"><span className="w-24 text-gray-500">Vendor Name:</span> <strong className="uppercase">{invoice.pharmacy_vendors?.name}</strong></div>
                                <div className="flex"><span className="w-24 text-gray-500">Address:</span> <span>{invoice.pharmacy_vendors?.address || 'N/A'}</span></div>
                                <div className="flex"><span className="w-24 text-gray-500">Contact:</span> <span>{invoice.pharmacy_vendors?.contact_person} ({invoice.pharmacy_vendors?.phone})</span></div>
                            </div>
                            <div>
                                <div className="flex"><span className="w-24 text-gray-500">Invoice No:</span> <strong>{invoice.invoice_number}</strong></div>
                                <div className="flex"><span className="w-24 text-gray-500">Invoice Date:</span> <span>{invoice.invoice_date}</span></div>
                                <div className="flex"><span className="w-24 text-gray-500">Vendor GSTIN:</span> <span>{invoice.pharmacy_vendors?.gstin || 'N/A'}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Table */}
                <table className="w-full border-collapse border border-gray-300 mb-4">
                    <thead>
                        <tr className="bg-slate-100 text-slate-800 uppercase text-[9px] tracking-wider">
                            <th className="border border-gray-300 px-2 py-1 w-8 text-center">SN</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">Medicine Name</th>
                            <th className="border border-gray-300 px-2 py-1 w-20 text-center">Batch</th>
                            <th className="border border-gray-300 px-2 py-1 w-16 text-center">Expiry</th>
                            <th className="border border-gray-300 px-2 py-1 w-12 text-center">Unit/Pk</th>
                            <th className="border border-gray-300 px-2 py-1 w-12 text-right">Qty</th>
                            <th className="border border-gray-300 px-2 py-1 w-16 text-right">MRP</th>
                            <th className="border border-gray-300 px-2 py-1 w-16 text-right">Rate</th>
                            <th className="border border-gray-300 px-2 py-1 w-20 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="text-[10px]">
                        {items.map((item, idx) => (
                            <tr key={item.id}>
                                <td className="border border-gray-300 px-2 py-1 text-center">{idx + 1}</td>
                                <td className="border border-gray-300 px-2 py-1 font-semibold">
                                    {item.clinic_medicine?.name}
                                    <div className="text-[8px] text-gray-500 font-normal">{item.clinic_medicine?.pack_size_label}</div>
                                </td>
                                <td className="border border-gray-300 px-2 py-1 font-mono text-center">{item.batch_number}</td>
                                <td className="border border-gray-300 px-2 py-1 text-center">{item.expiry_date ? format(new Date(item.expiry_date), 'MM-yy') : '-'}</td>
                                <td className="border border-gray-300 px-2 py-1 text-center">{item.pack_size_quantity}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right font-bold">{item.quantity}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right">{item.mrp.toFixed(2)}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right">{item.unit_price.toFixed(2)}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right font-bold">{item.total_amount.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Footer Section */}
                <div className="flex justify-between items-start mt-4 pt-4 border-t-2 border-slate-800">
                    <div className="w-[60%]">
                        <strong className="text-xs uppercase text-gray-600 block mb-1">Total Amount In Words:</strong>
                        <div className="italic font-medium capitalize bg-gray-50 p-2 rounded border border-gray-200 inline-block pr-6">
                            {numberToWords(invoice.total_amount)} Rupees Only
                        </div>
                    </div>
                    <div className="w-[35%] text-right space-y-2">
                        <div className="flex justify-between px-3 py-2 bg-slate-800 text-white font-bold text-lg rounded">
                            <span>Grand Total</span>
                            <span>₹{invoice.total_amount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Signature Area */}
                <div className="flex justify-between mt-12 px-8">
                    <div className="flex flex-col items-center">
                        <div className="w-40 border-b border-gray-400 mb-1"></div>
                        <div className="text-[9px] uppercase font-bold text-gray-400">Vendor Signature</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="w-40 border-b border-gray-400 mb-1"></div>
                        <div className="text-[9px] uppercase font-bold text-gray-400">Receiver / Authorized Signatory</div>
                    </div>
                </div>

            </div>
        </div>
    )
}
