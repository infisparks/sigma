'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, RefreshCcw } from 'lucide-react'

interface SalesReturnItem {
    id: string
    medicine_id: number
    medicine_name: string
    batch_number: string
    expiry_date: string
    sold_quantity: number // Units or Packs
    quantity_mode: 'Pack' | 'Unit'
    pack_size_quantity: number
    unit_price: number // Selling Price
    gst_percent: number // NEW
    gst_amount: number // Per Unit/Pack GST
    return_quantity: number
    return_amount: number
    return_gst_amount: number // NEW
    selected: boolean
}

export default function SalesReturnPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const saleId = searchParams.get('id')

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [saleDetails, setSaleDetails] = useState<any>(null)
    const [items, setItems] = useState<SalesReturnItem[]>([])
    const [reason, setReason] = useState('')

    useEffect(() => {
        if (saleId) fetchSaleDetails()
    }, [saleId])

    const fetchSaleDetails = async () => {
        try {
            // 1. Fetch Sale Header
            const { data: sale, error: saleError } = await supabase
                .from('pharmacy_sales')
                .select('*')
                .eq('id', saleId)
                .single()

            if (saleError) throw saleError
            setSaleDetails(sale)

            // 2. Fetch Items from Ledger (Transaction Type SALE)
            const { data: ledgerItems, error: ledgerError } = await supabase
                .from('pharmacy_stock_ledger')
                .select(`
                    id,
                    medicine_id,
                    batch_number,
                    expiry_date,
                    total_units,
                    pack_size_quantity,
                    total_amount,
                    quantity,
                    gst_percent,
                    gst_amount,
                    medicine:clinic_medicine(name)
                `)
                .eq('sale_invoice_id', saleId)
                .eq('transaction_type', 'SALE')

            if (ledgerError) throw ledgerError

            const mappedItems = (ledgerItems || []).map((i: any) => {
                // Infer mode: if total_units == quantity * pack_size, it's Pack mode. If total_units == quantity, it's Unit mode (or quantity is 1 pack).
                // But simplistically, let's assume what was sold.
                // Actually, the billing page determines this. 
                // We'll trust the ledger 'quantity' as the SOLD quantity in whatever unit it was (but ledger usually stores standardized).
                // Let's rely on 'quantity' as Pack count if pack_size > 1.
                // Wait, in billing page:
                // if (itemMode === 'Pack') totalUnits = qty * pack_size
                // Ledger 'quantity' usually stores PACKS. 
                // Let's use total_amount / quantity to get Price Per Pack?

                // Correction: In billing page, we didn't see exactly how it writes to ledger. 
                // Assuming standard practice: quantity = user input qty, total_units = calculated.

                const isPack = Math.abs(i.total_units) >= (i.pack_size_quantity || 1) // Heuristic
                const soldQty = Math.abs(i.quantity) // Ledger flows are negative for sales
                const price = Math.abs(i.total_amount) / (soldQty || 1)

                return {
                    id: i.id,
                    medicine_id: i.medicine_id,
                    medicine_name: i.medicine?.name,
                    batch_number: i.batch_number,
                    expiry_date: i.expiry_date,
                    sold_quantity: soldQty,
                    quantity_mode: 'Pack' as const, // Default to pack for now, or derive
                    pack_size_quantity: i.pack_size_quantity,
                    unit_price: price,
                    gst_percent: Number(i.gst_percent || 0),
                    gst_amount: Math.abs(Number(i.gst_amount || 0)) / (soldQty || 1),
                    return_quantity: 0,
                    return_amount: 0,
                    return_gst_amount: 0,
                    selected: false
                }
            })
            setItems(mappedItems)

        } catch (error) {
            console.error('Error fetching sale:', error)
            alert('Failed to load sale details')
        } finally {
            setLoading(false)
        }
    }

    const handleQuantityChange = (id: string, qty: number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(0, Math.min(qty, item.sold_quantity))
                return {
                    ...item,
                    return_quantity: newQty,
                    return_amount: newQty * item.unit_price,
                    return_gst_amount: newQty * item.gst_amount,
                    selected: newQty > 0
                }
            }
            return item
        }))
    }

    const toggleSelect = (id: string) => {
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, selected: !item.selected, return_quantity: !item.selected ? 1 : 0 } : item
        ))
    }

    const handleSubmit = async () => {
        const toReturn = items.filter(i => i.selected && i.return_quantity > 0)

        if (toReturn.length === 0) {
            alert("Please select items to return")
            return
        }
        if (!reason) {
            alert("Please provide a reason for return")
            return
        }

        setSubmitting(true)
        try {
            const payload = {
                p_sale_id: saleId,
                p_reason: reason,
                p_return_items: toReturn.map(i => ({
                    medicine_id: i.medicine_id,
                    batch_number: i.batch_number,
                    expiry_date: i.expiry_date,
                    quantity: i.return_quantity,
                    unit_mode: i.quantity_mode,
                    pack_size: i.pack_size_quantity,
                    amount: i.return_amount,
                    gst_amount: i.return_gst_amount
                }))
            }

            const { error } = await supabase.rpc('process_sales_return', payload)
            if (error) throw error

            alert("Sales Return processed successfully!")
            router.push('/pharmacy/sales')

        } catch (error: any) {
            console.error('Return failed:', error)
            alert('Failed to processing return: ' + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) return <div className="p-10 text-center">Loading...</div>

    const totalRefund = items.reduce((sum, item) => sum + (item.selected ? item.return_amount : 0), 0)

    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <h1 className="text-2xl font-bold text-gray-900">Sales Return</h1>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader className="bg-orange-50/50 pb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-orange-700">Return for {saleDetails?.customer_name}</CardTitle>
                            <div className="text-sm text-muted-foreground mt-1">
                                Sale ID: #{saleId} • Date: {saleDetails?.created_at && new Date(saleDetails.created_at).toLocaleDateString()}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-muted-foreground">Total Refund</div>
                            <div className="text-2xl font-bold text-orange-600">₹{totalRefund.toLocaleString('en-IN')}</div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Medicine</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead className="text-right">Sold Qty</TableHead>
                                <TableHead className="text-right">Return Qty</TableHead>
                                <TableHead className="text-right">Price/Unit</TableHead>
                                <TableHead className="text-right">Refund Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => (
                                <TableRow key={item.id} className={item.selected ? "bg-orange-50/30" : ""}>
                                    <TableCell>
                                        <Checkbox
                                            checked={item.selected}
                                            onCheckedChange={() => toggleSelect(item.id)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{item.medicine_name}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-xs font-mono">{item.batch_number}</div>
                                        <div className="text-xs text-muted-foreground">Exp: {item.expiry_date}</div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {item.sold_quantity} <span className="text-[10px] text-gray-500">{item.quantity_mode}</span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Input
                                            type="number"
                                            className="h-8 w-20 text-right ml-auto"
                                            value={item.return_quantity}
                                            onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                                            min={0}
                                            max={item.sold_quantity}
                                            disabled={!item.selected}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium text-orange-600">
                                        ₹{item.return_amount.toLocaleString('en-IN')}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <div className="mt-6 space-y-4 max-w-md ml-auto">
                        <div className="space-y-2">
                            <Label>Reason for Return</Label>
                            <Textarea
                                placeholder="e.g. Wrong medicine, Customer request..."
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                            />
                        </div>
                        <Button
                            className="w-full bg-orange-600 hover:bg-orange-700"
                            size="lg"
                            onClick={handleSubmit}
                            disabled={submitting || totalRefund === 0}
                        >
                            {submitting ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                            Confirm Sales Return
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
