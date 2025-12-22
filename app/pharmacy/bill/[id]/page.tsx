"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BillProps {
    params: {
        id: string
    }
}

interface SaleItem {
    id: string
    inventory_id: string
    quantity: number
    unit_price: number
    total_price: number
    pharmacy_inventory: {
        name: string
        pack_size_label: string
        batch_number: string
    }
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
    payment_method: string
    created_at: string
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

    useEffect(() => {
        const fetchBill = async () => {
            if (!params.id) return

            // Fetch Sale
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

            // Fetch Items
            const { data: itemsData, error: itemsError } = await supabase
                .from('pharmacy_sale_items')
                .select(`
                    *,
                    pharmacy_inventory (
                        name,
                        pack_size_label,
                        batch_number
                    )
                `)
                .eq('sale_id', params.id)

            if (itemsError) {
                console.error('Error fetching items:', itemsError)
            } else {
                setItems(itemsData || [])
            }
            setLoading(false)
        }

        fetchBill()
    }, [params.id])



    if (loading) return <div className="p-10 text-center">Loading Bill...</div>
    if (!sale) return <div className="p-10 text-center text-red-500">Bill not found</div>

    return (
        <div className="bg-gray-100 min-h-screen flex flex-col items-center py-10 print:bg-white print:p-0">
            {/* Print Button Wrapper - Hidden in Print */}
            <div className="no-print mb-6">
                <Button
                    onClick={() => window.print()}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                >
                    <Printer className="w-4 h-4 mr-2" />
                    Print Bill
                </Button>
            </div>
            <style jsx global>{`
                @page { size: A5; margin: 0; }
                @media print {
                    body { margin: 0; background: white; }
                    .no-print { display: none !important; }
                    .print-container {
                        width: 100% !important;
                        min-height: 100vh;
                        box-shadow: none !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                    }
                }
            `}</style>

            <div className="print-container w-[148mm] min-h-[210mm] bg-white text-black p-6 shadow-xl relative text-[10px] leading-tight font-sans">

                {/* Header */}
                <div className="text-center border-b-2 border-slate-800 pb-2 mb-2">
                    <h1 className="text-xl font-bold uppercase tracking-wider mb-1">CIGMA CHEMIST</h1>
                    <p className="text-[9px] text-gray-600 px-4">
                        Ground Floor, Virani Plaza, beside Bank of Maharashtra, near Kausa, Tetavli, Kausa, Mumbra, Thane, Maharashtra 400612
                    </p>
                </div>

                {/* Info Row */}
                <div className="flex justify-between mb-2 pb-2 border-b border-gray-200">
                    <div className="space-y-0.5">
                        <div className="flex">
                            <span className="font-bold w-14">Patient:</span>
                            <span className="uppercase">{sale.customer_name}</span>
                        </div>
                        <div className="flex">
                            <span className="font-bold w-14">Phone:</span>
                            <span>{sale.customer_phone || '-'}</span>
                        </div>
                        <div className="flex">
                            <span className="font-bold w-14">Doctor:</span>
                            <span className="uppercase">{sale.doctor_name || 'Self'}</span>
                        </div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <div className="flex justify-end gap-2">
                            <span className="font-bold">Date:</span>
                            <span>{format(new Date(sale.created_at), 'dd/MMM/yyyy')}</span>
                        </div>
                        <div className="flex justify-end gap-2">
                            <span className="font-bold">Time:</span>
                            <span>{format(new Date(sale.created_at), 'hh:mm a')}</span>
                        </div>
                        <div className="flex justify-end gap-2">
                            <span className="font-bold">Inv No:</span>
                            <span>{sale.id.slice(0, 7).toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="mb-2">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-400">
                                <th className="py-1 font-bold w-6">SN</th>
                                <th className="py-1 font-bold">Item Name</th>
                                <th className="py-1 font-bold w-10 text-right">Qty</th>
                                <th className="py-1 font-bold w-12 text-right">Rate</th>
                                <th className="py-1 font-bold w-12 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="text-[9px]">
                            {items.map((item, idx) => (
                                <tr key={item.id} className="border-b border-dashed border-gray-200">
                                    <td className="py-1">{idx + 1}</td>
                                    <td className="py-1">
                                        <div className="font-semibold">{item.pharmacy_inventory?.name}</div>
                                        <div className="text-[8px] text-gray-500 scale-90 origin-left">{item.pharmacy_inventory?.pack_size_label}</div>
                                    </td>
                                    <td className="py-1 text-right">{item.quantity}</td>
                                    <td className="py-1 text-right">{item.unit_price.toFixed(2)}</td>
                                    <td className="py-1 text-right">{item.total_price.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="mt-auto pt-2 border-t-2 border-slate-800">
                    <div className="flex justify-between items-start">
                        <div className="w-[60%]">
                            <div className="flex">
                                <span className="font-bold mr-1">Amount In Words:</span>
                            </div>
                            <div className="italic text-[9px] leading-relaxed capitalize">
                                {numberToWords(sale.curr_total)} Only
                            </div>
                        </div>
                        <div className="w-[35%] space-y-1">
                            <div className="flex justify-between">
                                <span className="font-semibold">Gross Amount:</span>
                                <span>{sale.subtotal.toFixed(2)}</span>
                            </div>
                            {sale.discount_amount > 0 && (
                                <div className="flex justify-between text-gray-600">
                                    <span>Discount:</span>
                                    <span>-{sale.discount_amount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-xs border-t border-gray-400 pt-1">
                                <span>Net Amount:</span>
                                <span>₹{sale.curr_total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 text-center text-[8px] text-gray-400">
                    <p>Get Well Soon!</p>
                    <p>Generated by Sigma Pharmacy System</p>
                </div>
            </div>
        </div>
    )
}
