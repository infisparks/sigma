'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Search, Calendar
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'


interface Purchase {
    id: string
    vendor: { name: string }
    purchase_date: string
    invoice_number: string
    total_amount: number
    status: string
    pharmacy_purchase_items: {
        inventory: { name: string }
        quantity: number
        unit_cost_price: number
    }[]
}

export default function PurchasesPage() {
    const [purchases, setPurchases] = useState<Purchase[]>([])
    const [loading, setLoading] = useState(true)

    // Filters
    const [dateFilter, setDateFilter] = useState('')
    const [searchFilter, setSearchFilter] = useState('')

    useEffect(() => {
        fetchPurchases()
    }, [dateFilter, searchFilter]) // Add dependencies

    const fetchPurchases = async () => {
        setLoading(true)
        let query = supabase
            .from('pharmacy_purchases')
            .select(`
                *, 
                vendor:pharmacy_vendors(name),
                pharmacy_purchase_items (
                    quantity,
                    unit_cost_price,
                    inventory:pharmacy_inventory(name)
                )
            `)
            .order('purchase_date', { ascending: false })

        if (dateFilter) {
            query = query.eq('purchase_date', dateFilter)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching purchases:', error)
        }

        let fetchedData = data || [] as any

        // Client-side filtering for medicine name since deep filtering is complex in supabase simple queries
        if (searchFilter) {
            fetchedData = fetchedData.filter((p: any) =>
                p.pharmacy_purchase_items.some((item: any) =>
                    item.inventory?.name.toLowerCase().includes(searchFilter.toLowerCase())
                )
            )
        }

        setPurchases(fetchedData)
        setLoading(false)
    }



    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Purchases History</h1>
                    <p className="text-muted-foreground">Log of stock incoming from vendors.</p>
                </div>

            </div>

            <div className="flex gap-4 items-center bg-white p-4 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <Input
                        type="date"
                        className="w-40"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 flex-1">
                    <Search className="h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Search by Medicine Name..."
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                    />
                </div>
                {(dateFilter || searchFilter) && (
                    <Button variant="ghost" onClick={() => { setDateFilter(''); setSearchFilter(''); }}>Clear</Button>
                )}
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Date</TableHead>
                                <TableHead className="w-[150px]">Vendor</TableHead>
                                <TableHead className="w-[100px]">Invoice #</TableHead>
                                <TableHead>Items (Medicine - Qty - Cost)</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                            ) : purchases.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No purchase history found.</TableCell></TableRow>
                            ) : (
                                purchases.map(p => (
                                    <TableRow key={p.id} className="hover:bg-gray-50">
                                        <TableCell className="align-top font-medium">{format(new Date(p.purchase_date), 'dd MMM yyyy')}</TableCell>
                                        <TableCell className="align-top text-gray-600">{p.vendor?.name || 'Unknown'}</TableCell>
                                        <TableCell className="align-top">{p.invoice_number || '-'}</TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                {p.pharmacy_purchase_items?.map((item, idx) => (
                                                    <div key={idx} className="text-sm flex gap-2">
                                                        <span className="font-medium text-blue-800">• {item.inventory?.name}</span>
                                                        <span className="text-gray-500">x{item.quantity} @ ₹{item.unit_cost_price}</span>
                                                    </div>
                                                ))}
                                                {(!p.pharmacy_purchase_items || p.pharmacy_purchase_items.length === 0) && (
                                                    <span className="text-gray-400 italic">No items details</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top text-right font-bold">₹{p.total_amount}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
