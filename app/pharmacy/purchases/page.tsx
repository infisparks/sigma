'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion'
import { Search, Calendar, FileText, ChevronDown, ChevronRight, Package, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

// Types based on NEW Schema (pharmacy_purchase_invoice)
interface PurchaseItem {
    id: string
    medicine_name: string
    batch_number: string
    expiry_date: string
    quantity: number
    qty_billed: number
    qty_free: number
    unit_price: number // Cost Rate
    mrp: number
    total_amount: number
}

interface PurchaseInvoice {
    id: string
    invoice_number: string
    invoice_date: string
    vendor_name: string
    total_amount: number
    status: string
    items: PurchaseItem[]
}

export default function PurchasesHistoryPage() {
    const [purchases, setPurchases] = useState<PurchaseInvoice[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedIds, setExpandedIds] = useState<string[]>([])

    // Filters
    const [dateFilter, setDateFilter] = useState('')
    const [searchFilter, setSearchFilter] = useState('')

    useEffect(() => {
        fetchHistory()
    }, [dateFilter])

    const fetchHistory = async () => {
        setLoading(true)
        try {
            // Query LEDGER for items instead of deleted pharmacy_purchase_item
            let query = supabase
                .from('pharmacy_purchase_invoice')
                .select(`
                    id,
                    invoice_number,
                    invoice_date,
                    total_amount,
                    status,
                    vendor:pharmacy_vendors(name),
                    items:pharmacy_stock_ledger(
                        id,
                        quantity_billed,
                        quantity_free,
                        rate_per_unit,
                        mrp,
                        total_amount,
                        batch_number,
                        expiry_date,
                        medicine:clinic_medicine(name)
                    )
                `)
                .eq('items.transaction_type', 'PURCHASE') // Only purchase entries
                .order('invoice_date', { ascending: false })

            if (dateFilter) {
                query = query.eq('invoice_date', dateFilter)
            }

            const { data, error } = await query

            if (error) throw error

            const mappedData: PurchaseInvoice[] = (data || []).map((p: any) => ({
                id: p.id,
                invoice_number: p.invoice_number,
                invoice_date: p.invoice_date,
                vendor_name: p.vendor?.name || 'Unknown Vendor',
                total_amount: p.total_amount,
                status: p.status,
                items: (p.items || []).map((i: any) => ({
                    id: i.id,
                    medicine_name: i.medicine?.name || 'Unknown Item',
                    batch_number: i.batch_number,
                    expiry_date: i.expiry_date,
                    quantity: (i.quantity_billed || 0) + (i.quantity_free || 0),
                    qty_billed: i.quantity_billed || 0,
                    qty_free: i.quantity_free || 0,
                    unit_price: i.rate_per_unit,
                    mrp: i.mrp,
                    total_amount: i.total_amount
                }))
            }))

            setPurchases(mappedData)
        } catch (error) {
            console.error('Error fetching purchase history:', error)
        } finally {
            setLoading(false)
        }
    }

    // Client-side Filter
    const filteredPurchases = purchases.filter(p =>
        p.vendor_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        p.invoice_number.toLowerCase().includes(searchFilter.toLowerCase())
    )

    const toggleExpand = (id: string) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <FileText className="h-8 w-8 text-blue-600" />
                        Purchase History
                    </h1>
                    <p className="text-muted-foreground">Archive of all procurement invoices.</p>
                </div>
            </div>

            {/* Filters */}
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search Vendor or Invoice No..."
                            className="pl-9 bg-gray-50 border-gray-200"
                            value={searchFilter}
                            onChange={e => setSearchFilter(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <Input
                            type="date"
                            className="w-full md:w-[180px]"
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                        />
                        {dateFilter && (
                            <Button variant="ghost" size="icon" onClick={() => setDateFilter('')}>
                                <Filter className="h-4 w-4 text-red-500" />
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-12 text-muted-foreground">Loading records...</div>
                ) : filteredPurchases.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        No invoices found matching your criteria.
                    </div>
                ) : (
                    filteredPurchases.map(invoice => (
                        <Card key={invoice.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
                            <div
                                className="bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                                onClick={() => toggleExpand(invoice.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full bg-blue-50 text-blue-600 transition-transform duration-200 ${expandedIds.includes(invoice.id) ? 'rotate-90' : ''}`}>
                                        <ChevronRight className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900 text-lg">{invoice.vendor_name}</span>
                                            <Badge variant="outline" className="font-mono text-xs">{invoice.invoice_number}</Badge>
                                        </div>
                                        <div className="text-sm text-gray-500 flex items-center gap-4 mt-1">
                                            <span>{format(new Date(invoice.invoice_date), 'dd MMM yyyy')}</span>
                                            <span>•</span>
                                            <span>{invoice.items.length} Items</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold text-gray-900">₹{invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                    <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-none">
                                        {invoice.status.toUpperCase()}
                                    </Badge>
                                    <div className="mt-2 text-xs">
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="h-auto p-0 text-blue-600 font-semibold"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.location.href = `/pharmacy/medicinePurchase?id=${invoice.id}`;
                                            }}
                                        >
                                            Manage Invoice
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            <div className={cn(
                                "border-t bg-gray-50/50 transition-all duration-300 ease-in-out px-4 overflow-hidden",
                                expandedIds.includes(invoice.id) ? "max-h-[500px] py-4 overflow-y-auto" : "max-h-0 py-0"
                            )}>
                                <Table>
                                    <TableHeader className="bg-gray-100">
                                        <TableRow>
                                            <TableHead>Medicine</TableHead>
                                            <TableHead>Batch</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Rate</TableHead>
                                            <TableHead className="text-right">MRP</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoice.items.map(item => (
                                            <TableRow key={item.id} className="hover:bg-white">
                                                <TableCell className="font-medium text-gray-800">{item.medicine_name}</TableCell>
                                                <TableCell>
                                                    <div className="font-mono text-xs">{item.batch_number}</div>
                                                    <div className="text-xs text-gray-400">Exp: {item.expiry_date}</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-medium text-gray-900">{item.quantity}</div>
                                                    {item.qty_free > 0 && (
                                                        <div className="text-[10px] text-green-600 font-semibold">
                                                            {item.qty_billed} + {item.qty_free} Free
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right text-gray-600">₹{item.unit_price}</TableCell>
                                                <TableCell className="text-right text-gray-600">₹{item.mrp}</TableCell>
                                                <TableCell className="text-right font-bold">₹{item.total_amount.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
