"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Search, FileText, Calendar as CalendarIcon, FilterX } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { format } from "date-fns"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

interface Sale {
    id: string
    invoice_no: string
    customer_name: string
    customer_phone: string
    doctor_name: string
    curr_total: number
    created_at: string
    status: string
}

export default function SalesHistoryPage() {
    const [sales, setSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [date, setDate] = useState<Date | undefined>(undefined)

    const fetchSales = async () => {
        setLoading(true)
        let query = supabase
            .from('pharmacy_sales')
            .select('*')
            .order('created_at', { ascending: false })

        if (searchQuery) {
            // Search by customer name, phone, or invoice ID (first 7 chars usually)
            // Note: searching ID might need exact match or casting to text. 
            // For simplicity, we'll try ILIKE on text fields.
            query = query.or(`customer_name.ilike.%${searchQuery}%,customer_phone.ilike.%${searchQuery}%`)
        }

        if (date) {
            // Filter by specific date (ignoring time)
            const startOfDay = new Date(date)
            startOfDay.setHours(0, 0, 0, 0)
            const endOfDay = new Date(date)
            endOfDay.setHours(23, 59, 59, 999)

            query = query.gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString())
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching sales:', error)
        } else {
            setSales(data || [])
        }
        setLoading(false)
    }

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchSales()
        }, 500)
        return () => clearTimeout(timer)
    }, [searchQuery, date])

    const clearFilters = () => {
        setSearchQuery("")
        setDate(undefined)
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Sales History</h1>
                    <p className="text-muted-foreground">View and manage past transactions</p>
                </div>
            </div>

            <Card className="border-none shadow-sm bg-white">
                <CardHeader className="pb-3 border-b">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                            <Input
                                placeholder="Search by patient name or phone..."
                                className="pl-9 bg-gray-50 border-gray-200"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-[240px] justify-start text-left font-normal border-gray-200 bg-gray-50",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Filter by date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            {(searchQuery || date) && (
                                <Button variant="ghost" onClick={clearFilters} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                    <FilterX className="h-4 w-4 mr-2" />
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-gray-50/50">
                            <TableRow>
                                <TableHead className="w-[100px]">Invoice No</TableHead>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Patient Details</TableHead>
                                <TableHead>Doctor</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        Loading transactions...
                                    </TableCell>
                                </TableRow>
                            ) : sales.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No sales found matching your criteria.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sales.map((sale) => (
                                    <TableRow key={sale.id} className="hover:bg-blue-50/30 transition-colors">
                                        <TableCell className="font-mono text-xs font-medium text-slate-500">
                                            #{sale.id.slice(0, 7).toUpperCase()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">{format(new Date(sale.created_at), 'dd MMM yyyy')}</span>
                                                <span className="text-xs text-muted-foreground">{format(new Date(sale.created_at), 'hh:mm a')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{sale.customer_name || 'Walk-in'}</span>
                                                {sale.customer_phone && (
                                                    <span className="text-xs text-muted-foreground">{sale.customer_phone}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm border rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">
                                                {sale.doctor_name || 'Self'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-slate-900">
                                            ₹{sale.curr_total.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
                                                {sale.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                                                onClick={() => window.open(`/pharmacy/bill/${sale.id}`, '_blank')}
                                            >
                                                <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                View Bill
                                            </Button>
                                        </TableCell>
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
