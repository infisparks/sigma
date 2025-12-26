"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface BillProps {
    params: {
        id: string
    }
}

interface SaleItem {
    id: string
    inventory_id: string
    medicine_id: string
    quantity: number
    quantity_mode: string
    package_size_quantity: number
    unit_price: number
    total_price: number
    discount_amount: number
    batch_number: string
    expiry_date: string
    medicine_name?: string // Manual fetch
}

interface Sale {
    id: string
    invoice_no: string
    customer_name: string
    customer_phone: string
    doctor_name: string
    sale_date: string
    subtotal: number
    discount_amount: number
    curr_total: number
    payment_mode: string
    created_at: string
    notes: string // Remarks
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

export default function BillPage({ params }: BillProps) {
    const [sale, setSale] = useState<Sale | null>(null)
    const [items, setItems] = useState<SaleItem[]>([])
    const [loading, setLoading] = useState(true)

    // Visibility Toggles
    const [showDiscount, setShowDiscount] = useState(true)
    const [showBatch, setShowBatch] = useState(true)
    const [showExp, setShowExp] = useState(true)
    const [showMode, setShowMode] = useState(false)
    const [showHSN, setShowHSN] = useState(false)

    useEffect(() => {
        const fetchBill = async () => {
            if (!params.id) return

            // 1. Fetch Sale
            const { data: saleData, error: saleError } = await supabase
                .from('pharmacy_sales')
                .select('*')
                .eq('id', params.id)
                .single()

            if (saleError) {
                console.error('Error fetching sale:', saleError)
                setLoading(false)
                return
            }
            setSale(saleData)

            // 2. Fetch Items
            const { data: itemsData, error: itemsError } = await supabase
                .from('pharmacy_sale_items')
                .select('*')
                .eq('sale_id', params.id)

            if (itemsError) {
                console.error('Error fetching items:', itemsError)
                setLoading(false)
                return
            }

            // 3. Manual Fetch Medicine Names
            if (itemsData && itemsData.length > 0) {
                const medIds = Array.from(new Set(itemsData.map((i: any) => i.medicine_id)))
                const { data: meds } = await supabase
                    .from('clinic_medicine')
                    .select('id, name')
                    .in('id', medIds)

                const medMap = new Map()
                meds?.forEach((m: any) => medMap.set(m.id, m.name))

                const formattedItems = itemsData.map((item: any) => ({
                    ...item,
                    medicine_name: medMap.get(item.medicine_id) || 'Unknown Medicine'
                }))
                setItems(formattedItems)
            } else {
                setItems([])
            }

            setLoading(false)
        }

        fetchBill()
    }, [params.id])


    if (loading) return <div className="p-10 text-center">Loading Bill...</div>
    if (!sale) return <div className="p-10 text-center text-red-500">Bill not found</div>

    return (
        <div className="bg-gray-100 min-h-screen flex flex-col items-center py-10 print:bg-white print:p-0">

            {/* Control Panel - Hidden in Print */}
            <div className="no-print mb-6 w-[210mm] bg-white p-4 rounded-lg shadow space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="font-bold text-lg">Bill Settings</h2>
                    <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Printer className="w-4 h-4 mr-2" /> Print Bill
                    </Button>
                </div>
                <div className="flex gap-6 text-sm">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="showDiscount" checked={showDiscount} onCheckedChange={(c) => setShowDiscount(!!c)} />
                        <Label htmlFor="showDiscount">Show Discount</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="showBatch" checked={showBatch} onCheckedChange={(c) => setShowBatch(!!c)} />
                        <Label htmlFor="showBatch">Show Batch</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="showExp" checked={showExp} onCheckedChange={(c) => setShowExp(!!c)} />
                        <Label htmlFor="showExp">Show Expiry</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="showMode" checked={showMode} onCheckedChange={(c) => setShowMode(!!c)} />
                        <Label htmlFor="showMode">Show Mode (Pack/Unit)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="showHSN" checked={showHSN} onCheckedChange={(c) => setShowHSN(!!c)} />
                        <Label htmlFor="showHSN">Show HSN</Label>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @page { size: A5 landscape; margin: 10mm; }
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
            <div className="print-container w-[210mm] min-h-[148mm] bg-white text-black p-8 shadow-xl relative text-[11px] leading-tight font-sans border border-gray-200">

                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                    <div className="w-[60%]">
                        <h1 className="text-3xl font-bold uppercase tracking-wide text-slate-900">CICMA CHEMIST</h1>
                        <p className="text-[10px] text-gray-700 mt-1 leading-normal w-[80%]">
                            Ground floor, Virani Plaza, beside Bank of Maharashtra,<br />
                            near Kausa, Tetavli, Kausa, Mumbra, Thane,<br />
                            Maharashtra 400612
                        </p>
                        <p className="text-[10px] font-semibold mt-1">Phone: +91 98765 43210</p>
                        <p className="text-[10px] font-bold mt-1">GSTIN: 27EAMPK6001D1ZY</p>
                        <p className="text-[9px] text-gray-600 mt-0.5">D.L.NO: 20-MH-TZ6-561969, 21-MH-TZ6-561970</p>
                    </div>
                    <div className="w-[40%] text-right space-y-1">
                        <div className="bg-slate-100 p-2 rounded border border-slate-300 inline-block text-left min-w-[180px]">
                            <div className="flex justify-between"><strong className="mr-2">Invoice No:</strong> <span>#{String(sale.id).slice(0, 8).toUpperCase()}</span></div>
                            <div className="flex justify-between"><strong className="mr-2">Date:</strong> <span>{format(new Date(sale.created_at), 'dd-MM-yyyy')}</span></div>
                            <div className="flex justify-between"><strong className="mr-2">Time:</strong> <span>{format(new Date(sale.created_at), 'hh:mm a')}</span></div>
                        </div>
                    </div>
                </div>

                {/* Patient & Doctor Info */}
                <div className="flex justify-between mb-4 border border-gray-300 rounded p-3">
                    <div className="w-[50%] space-y-1 border-r border-gray-300 pr-4">
                        <div className="text-xs font-bold uppercase text-slate-700 border-b border-gray-200 mb-1 pb-1">Patient Details</div>
                        <div className="flex"><span className="w-20 text-gray-500">Name:</span> <strong>{sale.customer_name}</strong></div>
                        <div className="flex"><span className="w-20 text-gray-500">Mobile:</span> <span>{sale.customer_phone || 'N/A'}</span></div>
                        <div className="flex"><span className="w-20 text-gray-500">Address:</span> <span>Mumbra (Default)</span></div>
                    </div>
                    <div className="w-[50%] space-y-1 pl-4">
                        <div className="text-xs font-bold uppercase text-slate-700 border-b border-gray-200 mb-1 pb-1">Ref. Doctor</div>
                        <div className="flex"><span className="w-20 text-gray-500">Name:</span> <span className="uppercase">{sale.doctor_name || 'Self'}</span></div>
                    </div>
                </div>

                {/* Main Table */}
                <table className="w-full border-collapse border border-gray-300 mb-4">
                    <thead>
                        <tr className="bg-slate-100 text-slate-800 uppercase text-[9px] tracking-wider">
                            <th className="border border-gray-300 px-2 py-1 w-8 text-center">SN</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">Product Description</th>
                            {showHSN && <th className="border border-gray-300 px-2 py-1 w-12 text-center">HSN</th>}
                            {showMode && <th className="border border-gray-300 px-2 py-1 w-12 text-center">Mode</th>}
                            {showBatch && <th className="border border-gray-300 px-2 py-1 w-20 text-left">Batch</th>}
                            {showExp && <th className="border border-gray-300 px-2 py-1 w-16 text-center">Exp.</th>}
                            <th className="border border-gray-300 px-2 py-1 w-12 text-right">Qty</th>
                            <th className="border border-gray-300 px-2 py-1 w-16 text-right">Rate</th>
                            {showDiscount && <th className="border border-gray-300 px-2 py-1 w-16 text-right">Disc.</th>}
                            <th className="border border-gray-300 px-2 py-1 w-20 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="text-[10px]">
                        {items.map((item, idx) => (
                            <tr key={item.id}>
                                <td className="border border-gray-300 px-2 py-1 text-center">{idx + 1}</td>
                                <td className="border border-gray-300 px-2 py-1 font-semibold">{item.medicine_name}</td>
                                {showHSN && <td className="border border-gray-300 px-2 py-1 text-center">-</td>}
                                {showMode && <td className="border border-gray-300 px-2 py-1 text-center">{item.quantity_mode}</td>}
                                {showBatch && <td className="border border-gray-300 px-2 py-1 font-mono">{item.batch_number}</td>}
                                {showExp && <td className="border border-gray-300 px-2 py-1 text-center">{item.expiry_date ? format(new Date(item.expiry_date), 'MM-yy') : '-'}</td>}
                                <td className="border border-gray-300 px-2 py-1 text-right font-bold">{item.quantity}</td>
                                <td className="border border-gray-300 px-2 py-1 text-right">{item.unit_price.toFixed(2)}</td>
                                {showDiscount && <td className="border border-gray-300 px-2 py-1 text-right text-gray-500">{item.discount_amount > 0 ? item.discount_amount.toFixed(2) : '-'}</td>}
                                <td className="border border-gray-300 px-2 py-1 text-right font-bold">{item.total_price.toFixed(2)}</td>
                            </tr>
                        ))}

                    </tbody>
                </table>

                {/* Footer Section: Remarks & Calculations */}
                <div className="flex border border-gray-300 rounded overflow-hidden">
                    {/* Left Side: Remarks & Words & Terms */}
                    <div className="flex-1 p-3 border-r border-gray-300 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div>
                                <strong className="text-xs uppercase text-gray-600 block mb-1">Amount In Words:</strong>
                                <div className="italic font-medium capitalize bg-gray-50 p-2 rounded border border-gray-200">
                                    {numberToWords(sale.curr_total)} Rupees Only
                                </div>
                            </div>

                            {sale.notes && (
                                <div>
                                    <strong className="text-xs uppercase text-gray-600 block mb-1">Remarks / Notes:</strong>
                                    <div className="text-xs border-l-2 border-slate-500 pl-2 text-slate-700">
                                        {sale.notes}
                                    </div>
                                </div>
                            )}

                            <div className="text-[9px] text-gray-500 space-y-1 pt-4">
                                <p className="font-bold underline">Terms & Conditions:</p>
                                <ul className="list-disc list-inside">
                                    <li>Goods once sold will not be taken back.</li>
                                    <li>Subject to Thane Jurisdiction.</li>
                                    <li>Please consult doctor before administration.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Totals */}
                    <div className="w-[35%]">
                        <div className="flex justify-between px-3 py-2 border-b border-gray-200">
                            <span className="font-semibold text-gray-600">Sub Total</span>
                            <span className="font-mono">{sale.subtotal.toFixed(2)}</span>
                        </div>
                        {showDiscount && sale.discount_amount > 0 && (
                            <div className="flex justify-between px-3 py-2 border-b border-gray-200 text-green-700 bg-green-50">
                                <span className="font-semibold">Discount</span>
                                <span className="font-mono">-{sale.discount_amount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between px-3 py-2 border-b border-gray-200">
                            <span className="font-semibold text-gray-600">Round Off</span>
                            <span className="font-mono">{(Math.round(sale.curr_total) - sale.curr_total).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-3 bg-slate-800 text-white font-bold text-lg">
                            <span>Grand Total</span>
                            <span>₹{Math.round(sale.curr_total)}</span>
                        </div>
                        <div className="px-3 py-2 text-right text-[10px] text-gray-500 border-b border-gray-200">
                            Mode: <span className="font-bold text-black uppercase">{sale.payment_mode}</span>
                        </div>

                        {/* Signature Area */}
                        <div className="h-28 flex flex-col justify-end items-center pb-2">
                            <div className="text-[9px] uppercase font-bold text-gray-400 mb-8 w-full text-center">For CICMA CHEMIST</div>
                            <div className="w-3/4 border-b border-gray-400"></div>
                            <div className="text-[9px] mt-1">Authorized Signatory</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
