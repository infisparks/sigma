'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Plus, Search, Building2, Phone, Mail, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner' // Assuming sonner is used, or use generic toast

interface Vendor {
    id: string
    name: string
    contact_person: string
    phone: string
    email: string
    address: string
    gstin: string
}

export default function VendorsPage() {
    const [vendors, setVendors] = useState<Vendor[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [newVendor, setNewVendor] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        gstin: ''
    })

    useEffect(() => {
        fetchVendors()
    }, [])

    const fetchVendors = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('pharmacy_vendors')
                .select('*')
                .order('name')

            if (error) throw error
            setVendors(data || [])
        } catch (error) {
            console.error('Error fetching vendors:', error)
            // toast.error('Failed to load vendors')
        } finally {
            setLoading(false)
        }
    }

    const handleAddVendor = async () => {
        if (!newVendor.name) {
            alert('Vendor Name is required')
            return
        }

        try {
            const { error } = await supabase
                .from('pharmacy_vendors')
                .insert([newVendor])

            if (error) throw error

            setIsAddOpen(false)
            setNewVendor({ name: '', contact_person: '', phone: '', email: '', address: '', gstin: '' })
            fetchVendors()
            // toast.success('Vendor added successfully')
        } catch (error) {
            console.error('Error adding vendor:', error)
            alert('Failed to add vendor')
        }
    }

    const filteredVendors = vendors.filter(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Vendors</h1>
                    <p className="text-muted-foreground">Manage your medicine suppliers and distributors.</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all">
                            <Plus className="mr-2 h-4 w-4" /> Add Vendor
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Add New Vendor</DialogTitle>
                            <DialogDescription>
                                Enter the details of the new medicine supplier.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Company Name *</Label>
                                    <Input
                                        id="name"
                                        value={newVendor.name}
                                        onChange={e => setNewVendor({ ...newVendor, name: e.target.value })}
                                        placeholder="e.g. Apollo Pharma"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="contact">Contact Person</Label>
                                    <Input
                                        id="contact"
                                        value={newVendor.contact_person}
                                        onChange={e => setNewVendor({ ...newVendor, contact_person: e.target.value })}
                                        placeholder="e.g. John Doe"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input
                                        id="phone"
                                        value={newVendor.phone}
                                        onChange={e => setNewVendor({ ...newVendor, phone: e.target.value })}
                                        placeholder="+91..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        value={newVendor.email}
                                        onChange={e => setNewVendor({ ...newVendor, email: e.target.value })}
                                        placeholder="sales@vendor.com"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Input
                                    id="address"
                                    value={newVendor.address}
                                    onChange={e => setNewVendor({ ...newVendor, address: e.target.value })}
                                    placeholder="Full address"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="gstin">GSTIN / Tax ID</Label>
                                <Input
                                    id="gstin"
                                    value={newVendor.gstin}
                                    onChange={e => setNewVendor({ ...newVendor, gstin: e.target.value })}
                                    placeholder="GST Number"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                            <Button onClick={handleAddVendor} className="bg-blue-600 hover:bg-blue-700">Save Vendor</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center space-x-2">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search vendors..."
                                className="pl-8 bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border bg-white">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50/50">
                                    <TableHead>Vendor Name</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>GSTIN</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
                                    </TableRow>
                                ) : filteredVendors.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            No vendors found. Add one to get started.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredVendors.map((vendor) => (
                                        <TableRow key={vendor.id} className="hover:bg-blue-50/50 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span className="text-gray-900">{vendor.name}</span>
                                                    <span className="text-xs text-gray-400 flex items-center mt-0.5">
                                                        <MapPin className="h-3 w-3 mr-1" /> {vendor.address || 'No address'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{vendor.contact_person || '-'}</TableCell>
                                            <TableCell>
                                                {vendor.phone && (
                                                    <div className="flex items-center text-gray-600">
                                                        <Phone className="h-3 w-3 mr-2" />
                                                        {vendor.phone}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {vendor.email && (
                                                    <div className="flex items-center text-gray-600">
                                                        <Mail className="h-3 w-3 mr-2" />
                                                        {vendor.email}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{vendor.gstin || '-'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
