'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
    Search, Plus, User, ShoppingCart, Trash2, CreditCard, UserPlus, Eye, History as HistoryIcon
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { supabase } from '@/lib/supabase'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format, subYears, subMonths, subDays } from 'date-fns'

// Types
interface InventoryItem {
    id: string
    name: string
    pack_size_label: string
    current_stock: number
    mrp: number
    batch_number: string
    expiry_date: string
}

interface CartItem extends InventoryItem {
    cart_quantity: number
    unit_price: number // Can be discounted or changed
    total: number
}

interface Patient {
    uhid: string
    name: string
    number: number
    age: number
    gender: string
}

export default function PharmacyBillingPage() {
    // Inventory Search
    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState<InventoryItem[]>([])
    const [searchLoading, setSearchLoading] = useState(false)

    // Cart
    const [cart, setCart] = useState<CartItem[]>([])
    const [discountAmount, setDiscountAmount] = useState(0)

    // Patient
    const [patientSearch, setPatientSearch] = useState('')
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [patientHints, setPatientHints] = useState<Patient[]>([])

    const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false)

    // Doctors
    const [doctors, setDoctors] = useState<{ id: string, name: string }[]>([])
    const [doctorMap, setDoctorMap] = useState<Record<number, string>>({})
    const [selectedDoctor, setSelectedDoctor] = useState<string>('')

    useEffect(() => {
        const fetchDoctors = async () => {
            const { data } = await supabase.from('opd_datasets').select('datajson').eq('dataname', 'refer_doctors').single()
            if (data?.datajson) {
                setDoctors(Array.isArray(data.datajson) ? data.datajson : [])
            }

            // Fetch Treating Doctors from config_data
            const { data: configData } = await supabase.from('config_data').select('data').eq('data_heading', 'opd_doctor_data').single()
            if (configData?.data) {
                const map: Record<number, string> = {}
                if (Array.isArray(configData.data)) {
                    configData.data.forEach((doc: any) => {
                        map[doc.id] = doc.doctor_name
                    })
                }
                setDoctorMap(map)
            }
        }
        fetchDoctors()
    }, [])

    // New Patient
    const [isRegisterMode, setIsRegisterMode] = useState(false)
    const [newPatientData, setNewPatientData] = useState({
        title: 'MR',
        name: '',
        number: '',
        age: '',
        age_unit: 'year',
        gender: 'Male',
        address: ''
    })

    // Checkout
    const [checkoutLoading, setCheckoutLoading] = useState(false)

    // Medicine History
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)
    const [historyList, setHistoryList] = useState<any[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const fetchMedicineHistory = async () => {
        if (!selectedPatient?.uhid) return

        setLoadingHistory(true)
        setIsHistoryOpen(true)
        try {
            const { data, error } = await supabase
                .from('opd_registration')
                .select('created_at, rx_list_json, treating_doctor_id') // Use treating_doctor_id
                .eq('uhid', selectedPatient.uhid)
                .not('rx_list_json', 'is', null)
                .order('created_at', { ascending: false })

            if (error) throw error
            // Filter out entries with valid non-empty arrays
            const validList = (data || []).filter(item => Array.isArray(item.rx_list_json) && item.rx_list_json.length > 0)
            setHistoryList(validList)
        } catch (error) {
            console.error("Error fetching history:", error)
            alert("Failed to load medicine history")
        } finally {
            setLoadingHistory(false)
        }
    }

    // --- Search Inventory ---
    useEffect(() => {
        const delaySearch = setTimeout(async () => {
            if (searchTerm.length < 2) {
                setSearchResults([])
                return
            }
            setSearchLoading(true)
            const { data } = await supabase
                .from('pharmacy_inventory')
                .select('*')
                .ilike('name', `%${searchTerm}%`)
                .limit(10)

            setSearchResults(data || [])
            setSearchLoading(false)
        }, 300)

        return () => clearTimeout(delaySearch)
    }, [searchTerm])

    // --- Search Patient ---
    useEffect(() => {
        const delayPatient = setTimeout(async () => {
            if (patientSearch.length < 3 || selectedPatient) {
                setPatientHints([])
                setIsPatientSearchOpen(false)
                return
            }

            let query = supabase.from('patient_detail').select('uhid, name, number, age, gender').limit(5)

            if (!isNaN(Number(patientSearch))) {
                query = query.eq('number', patientSearch)
            } else {
                query = query.ilike('name', `%${patientSearch}%`)
            }

            const { data } = await query
            setPatientHints(data || [])
            setIsPatientSearchOpen(true)
        }, 300)

        return () => clearTimeout(delayPatient)
    }, [patientSearch, selectedPatient])

    const addToCart = (item: InventoryItem) => {
        const existing = cart.find(i => i.id === item.id)
        if (existing) {
            updateQuantity(item.id, existing.cart_quantity + 1)
        } else {
            setCart([...cart, { ...item, cart_quantity: 1, unit_price: item.mrp, total: item.mrp }])
        }
        setSearchTerm('')
        setSearchResults([]) // Close info
    }

    const updateQuantity = (id: string, qty: number) => {
        if (qty < 1) return
        setCart(cart.map(item => {
            if (item.id === id) {
                // Check stock
                if (qty > item.current_stock) {
                    alert(`Only ${item.current_stock} available in stock!`)
                    return item
                }
                return { ...item, cart_quantity: qty, total: qty * item.unit_price }
            }
            return item
        }))
    }

    const removeItem = (id: string) => {
        setCart(cart.filter(item => item.id !== id))
    }

    const calculateSubtotal = () => cart.reduce((acc, item) => acc + item.total, 0)
    const calculateFinalTotal = () => Math.max(0, calculateSubtotal() - discountAmount)

    const handleCheckout = async () => {
        if (cart.length === 0) {
            alert('Cart is empty')
            return
        }

        setCheckoutLoading(true)
        try {
            // 1. Create Sale
            const { data: sale, error: saleError } = await supabase
                .from('pharmacy_sales')
                .insert({
                    customer_name: selectedPatient ? selectedPatient.name : 'Walk-in Customer',
                    customer_phone: selectedPatient ? selectedPatient.number.toString() : null,
                    patient_id: selectedPatient?.uhid || null,
                    doctor_name: selectedDoctor,
                    notes: null,
                    subtotal: calculateSubtotal(),
                    discount_amount: discountAmount,
                    curr_total: calculateFinalTotal(),
                    payment_method: 'cash',
                    status: 'completed'
                })
                .select()
                .single()

            if (saleError) throw saleError

            // 2. Create Sale Items
            const saleItems = cart.map(item => ({
                sale_id: sale.id,
                inventory_id: item.id,
                quantity: item.cart_quantity,
                unit_price: item.unit_price,
                total_price: item.total
            }))

            const { error: itemsError } = await supabase
                .from('pharmacy_sale_items')
                .insert(saleItems)

            if (itemsError) throw itemsError

            // 3. Update Inventory Stock
            for (const item of cart) {
                const newStock = item.current_stock - item.cart_quantity
                await supabase
                    .from('pharmacy_inventory')
                    .update({ current_stock: newStock })
                    .eq('id', item.id)
            }

            alert('Sale Completed! Total: ₹' + calculateFinalTotal())
            setCart([])
            setSelectedPatient(null)
            setPatientSearch('')
            setDiscountAmount(0)
            setSelectedDoctor('') // Reset doctor

            // Open Bill
            window.open(`/pharmacy/bill/${sale.id}`, '_blank')

        } catch (error) {
            console.error('Checkout failed', error)
            alert('Checkout Failed')
        } finally {
            setCheckoutLoading(false)
        }
    }

    const handleCreatePatient = async () => {
        // Validation
        if (!newPatientData.name || !newPatientData.number || !newPatientData.age) {
            alert('Please fill Name, Number, and Age')
            return
        }

        try {
            // Calculate DOB
            const ageVal = parseInt(newPatientData.age)
            let dobDate = new Date()
            if (newPatientData.age_unit === 'year') dobDate = subYears(new Date(), ageVal)
            else if (newPatientData.age_unit === 'month') dobDate = subMonths(new Date(), ageVal)
            else if (newPatientData.age_unit === 'day') dobDate = subDays(new Date(), ageVal)

            const payload = {
                title: newPatientData.title,
                name: newPatientData.name,
                number: parseInt(newPatientData.number),
                age: ageVal,
                age_unit: newPatientData.age_unit,
                gender: newPatientData.gender,
                dob: format(dobDate, 'yyyy-MM-dd'),
                address: newPatientData.address,
                // created_at, uhid, total_day handled by DB/Triggers
            }

            const { data, error } = await supabase
                .from('patient_detail')
                .insert([payload])
                .select()
                .single()

            if (error) throw error

            setSelectedPatient({
                uhid: data.uhid,
                name: data.name,
                number: data.number,
                age: data.age,
                gender: data.gender
            })
            setIsRegisterMode(false)
            // Reset form
            setNewPatientData({
                title: 'MR',
                name: '',
                number: '',
                age: '',
                age_unit: 'Years',
                gender: 'Male',
                address: ''
            })
            alert(`Patient Registered Successfully! UHID: ${data.uhid}`)

        } catch (error: any) {
            console.error('Error creating patient:', error)
            alert('Failed to register patient: ' + error.message)
        }
    }

    return (
        <div className="flex h-screen bg-gray-100 p-2 gap-2 overflow-hidden">
            {/* Left Column: POS Interface */}
            <div className="flex-1 flex flex-col gap-2">
                {/* Search Bar */}
                <Card className="p-3 bg-white border-0 shadow-sm overflow-visible z-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <Input
                            className="pl-10 h-11 text-lg"
                            placeholder="Scan barcode or search medicine..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchResults.length > 0 && (
                            <div className="absolute top-12 left-0 w-full bg-white shadow-2xl border rounded-md z-50 max-h-[300px] overflow-auto">
                                <Table>
                                    <TableHeader className="bg-gray-50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead className="w-[100px]">Batch</TableHead>
                                            <TableHead className="w-[80px]">Stock</TableHead>
                                            <TableHead className="w-[80px]">MRP</TableHead>
                                            <TableHead className="w-[50px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {searchResults.map(item => (
                                            <TableRow key={item.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => addToCart(item)}>
                                                <TableCell className="font-medium max-w-[200px] truncate" title={item.name}>
                                                    {item.name}
                                                    <div className="text-xs text-gray-500 truncate">{item.pack_size_label}</div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">{item.batch_number}</TableCell>
                                                <TableCell>
                                                    <Badge variant={item.current_stock < 5 ? 'destructive' : 'outline'}>
                                                        {item.current_stock}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>₹{item.mrp}</TableCell>
                                                <TableCell><Plus className="h-4 w-4 text-blue-600" /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Cart List */}
                <Card className="flex-1 flex flex-col border-0 shadow-sm overflow-hidden">
                    <CardHeader className="py-3 bg-gray-50 border-b">
                        <CardTitle className="flex justify-between items-center text-lg">
                            <span className="flex items-center"><ShoppingCart className="mr-2" /> Current Bill</span>
                            <Badge variant="secondary">{cart.length} Items</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0">
                        <Table>
                            <TableHeader className="bg-white sticky top-0">
                                <TableRow>
                                    <TableHead className="w-[40%]">Item Name</TableHead>
                                    <TableHead>Batch</TableHead>
                                    <TableHead>Expiry</TableHead>
                                    <TableHead className="w-[15%]">Qty</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cart.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-40 text-center text-gray-400 text-lg">
                                            Cart is empty. Search items to add.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    cart.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                {item.name}
                                                <div className="text-xs text-gray-500">{item.pack_size_label}</div>
                                            </TableCell>
                                            <TableCell>{item.batch_number}</TableCell>
                                            <TableCell>{item.expiry_date}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.cart_quantity - 1)}>-</Button>
                                                    <span className="w-4 text-center">{item.cart_quantity}</span>
                                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.cart_quantity + 1)}>+</Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>₹{item.unit_price}</TableCell>
                                            <TableCell className="font-bold">₹{item.total}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeItem(item.id)}>
                                                    <Trash2 className="h-4 w-4" />
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

            {/* Right Column: Customer & Payment */}
            <div className="w-[350px] flex flex-col gap-2">
                {/* Customer Card */}
                <Card className="border-0 shadow-sm top-0">
                    <CardHeader className="pb-3 bg-blue-50 rounded-t-lg">
                        <CardTitle className="text-base flex items-center text-blue-800">
                            <User className="mr-2 h-4 w-4" /> Patient Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        {!selectedPatient ? (
                            isRegisterMode ? (
                                <div className="space-y-3 animate-in fade-in slide-in-from-right-5 duration-300">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-sm">New Registration</h3>
                                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setIsRegisterMode(false)}>Cancel</Button>
                                    </div>

                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="col-span-1">
                                            <Label className="text-xs">Title</Label>
                                            <Select value={newPatientData.title} onValueChange={(val) => setNewPatientData({ ...newPatientData, title: val })}>
                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {['MR', 'MRS', 'MS', 'BABY', 'MASTER', 'DR'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-3">
                                            <Label className="text-xs">Name</Label>
                                            <Input className="h-8 text-xs" placeholder="Full Name" value={newPatientData.name} onChange={e => setNewPatientData({ ...newPatientData, name: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-xs">Phone</Label>
                                            <Input className="h-8 text-xs" type="number" placeholder="Mobile" value={newPatientData.number} onChange={e => setNewPatientData({ ...newPatientData, number: e.target.value })} />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Gender</Label>
                                            <Select value={newPatientData.gender} onValueChange={(val) => setNewPatientData({ ...newPatientData, gender: val })}>
                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Male">Male</SelectItem>
                                                    <SelectItem value="Female">Female</SelectItem>
                                                    <SelectItem value="Other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="w-1/3">
                                            <Label className="text-xs">Age</Label>
                                            <Input className="h-8 text-xs" type="number" placeholder="Age" value={newPatientData.age} onChange={e => setNewPatientData({ ...newPatientData, age: e.target.value })} />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-xs">Unit</Label>
                                            <Select value={newPatientData.age_unit} onValueChange={(val) => setNewPatientData({ ...newPatientData, age_unit: val })}>
                                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="year">Year</SelectItem>
                                                    <SelectItem value="month">Month</SelectItem>
                                                    <SelectItem value="day">Day</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-xs">Address</Label>
                                        <Input className="h-8 text-xs" placeholder="City / Area" value={newPatientData.address} onChange={e => setNewPatientData({ ...newPatientData, address: e.target.value })} />
                                    </div>

                                    <Button className="w-full h-8 mt-2" size="sm" onClick={handleCreatePatient}>Register & Add</Button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Label className="mb-1 block">Search Patient</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Name / Phone / UHID"
                                            value={patientSearch}
                                            onChange={e => setPatientSearch(e.target.value)}
                                        />
                                        <Button size="icon" variant="outline" onClick={() => setIsRegisterMode(true)}>
                                            <UserPlus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {isPatientSearchOpen && patientHints.length > 0 && (
                                        <div className="absolute w-full bg-white border rounded shadow-lg z-20 mt-1 max-h-40 overflow-auto">
                                            {patientHints.map(p => (
                                                <div
                                                    key={p.uhid}
                                                    className="p-2 hover:bg-gray-50 cursor-pointer border-b text-sm"
                                                    onClick={() => { setSelectedPatient(p); setPatientSearch(''); setIsPatientSearchOpen(false); }}
                                                >
                                                    <div className="font-bold text-blue-600">{p.name}</div>
                                                    <div className="text-gray-500 text-xs">{p.number} • {p.age}/{p.gender}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 relative group">
                                <div className="absolute top-2 right-2 flex gap-2">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-blue-600 hover:bg-blue-100"
                                        onClick={fetchMedicineHistory}
                                        title="View Medicine History"
                                    >
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    <div className="cursor-pointer text-gray-400 hover:text-red-500" onClick={() => setSelectedPatient(null)}>
                                        <Trash2 className="h-4 w-4" />
                                    </div>
                                </div>
                                <div className="font-bold text-lg text-blue-900">{selectedPatient.name}</div>
                                <div className="text-sm text-blue-700">UHID: {selectedPatient.uhid}</div>
                                <div className="text-sm text-gray-600 mt-1">{selectedPatient.number}</div>
                                <div className="text-sm text-gray-600">{selectedPatient.age} Y / {selectedPatient.gender}</div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Doctor Selection */}
                <Card className="border-0 shadow-sm">
                    <CardHeader className="py-2 px-3 bg-purple-50 rounded-t-lg">
                        <CardTitle className="text-sm flex items-center text-purple-800">
                            Referral Doctor
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                        <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select Doctor" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Self">Self / None</SelectItem>
                                {doctors.map(doc => (
                                    <SelectItem key={doc.id} value={doc.name}>{doc.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* Summary Card */}
                <Card className="flex-1 flex flex-col border-0 shadow-sm">
                    <CardHeader className="bg-gray-50 border-b pb-3">
                        <CardTitle className="text-base">Payment Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4 pt-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="font-medium">₹{calculateSubtotal()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Discount (₹)</span>
                            <Input
                                type="number"
                                className="w-20 h-8 text-right"
                                value={discountAmount}
                                onChange={e => setDiscountAmount(Number(e.target.value))}
                            />
                        </div>
                        <div className="flex justify-between text-sm text-green-600">
                            <span>Discount Amount</span>
                            <span>- ₹{discountAmount.toFixed(2)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-2xl font-bold text-gray-900">
                            <span>Total</span>
                            <span>₹{calculateFinalTotal().toFixed(2)}</span>
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-3 p-4 bg-gray-50 border-t">
                        <Button
                            className="w-full h-12 text-lg bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                            onClick={handleCheckout}
                            disabled={checkoutLoading}
                        >
                            {checkoutLoading ? 'Processing...' : (
                                <>
                                    <CreditCard className="mr-2 h-5 w-5" /> PAY & BILL
                                </>
                            )}
                        </Button>

                    </CardFooter>
                </Card>
            </div>

            {/* Medicine History Modal */}
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <HistoryIcon className="h-5 w-5 text-blue-600" />
                            Medicine History - {selectedPatient?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Past prescriptions from OPD visits.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {loadingHistory ? (
                            <div className="text-center py-10 text-gray-500">Loading history...</div>
                        ) : historyList.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
                                No prescription history found for this patient.
                            </div>
                        ) : (
                            historyList.map((visit, idx) => (
                                <Card key={idx} className="border shadow-sm">
                                    <CardHeader className="py-3 px-4 bg-gray-50 border-b flex flex-row items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline" className="bg-white">
                                                {format(new Date(visit.created_at), 'dd MMM yyyy')}
                                            </Badge>
                                            <span className="text-sm font-medium text-gray-600">
                                                {format(new Date(visit.created_at), 'h:mm a')}
                                            </span>
                                        </div>
                                        <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                            {doctorMap[visit.treating_doctor_id] || 'Unknown Doctor'}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <Table>
                                            <TableHeader className="bg-white">
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="h-8 text-xs w-[40%]">Medicine</TableHead>
                                                    <TableHead className="h-8 text-xs">Dosage</TableHead>
                                                    <TableHead className="h-8 text-xs">Duration</TableHead>
                                                    <TableHead className="h-8 text-xs">Instructions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {visit.rx_list_json.map((med: any, i: number) => (
                                                    <TableRow key={i} className="hover:bg-gray-50">
                                                        <TableCell className="py-2 font-medium text-sm">
                                                            {med.name}
                                                            <div className="text-[10px] text-gray-400 uppercase">{med.type}</div>
                                                        </TableCell>
                                                        <TableCell className="py-2 text-xs">
                                                            <span className="font-semibold bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{med.dosage}</span>
                                                        </TableCell>
                                                        <TableCell className="py-2 text-xs text-gray-600">{med.duration}</TableCell>
                                                        <TableCell className="py-2 text-xs text-gray-500 max-w-[150px] truncate" title={med.note}>
                                                            {med.note || '-'}
                                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                                {med.timing?.bb && <span title="Before Breakfast" className="cursor-help text-[9px] bg-green-50 text-green-700 px-1 rounded border border-green-200">BB (Before Breakfast)</span>}
                                                                {med.timing?.ab && <span title="After Breakfast" className="cursor-help text-[9px] bg-blue-50 text-blue-700 px-1 rounded border border-blue-200">AB (After Breakfast)</span>}
                                                                {med.timing?.bl && <span title="Before Lunch" className="cursor-help text-[9px] bg-yellow-50 text-yellow-700 px-1 rounded border border-yellow-200">BL (Before Lunch)</span>}
                                                                {med.timing?.al && <span title="After Lunch" className="cursor-help text-[9px] bg-orange-50 text-orange-700 px-1 rounded border border-orange-200">AL (After Lunch)</span>}
                                                                {med.timing?.bd && <span title="Before Dinner" className="cursor-help text-[9px] bg-indigo-50 text-indigo-700 px-1 rounded border border-indigo-200">BD (Before Dinner)</span>}
                                                                {med.timing?.ad && <span title="After Dinner" className="cursor-help text-[9px] bg-purple-50 text-purple-700 px-1 rounded border border-purple-200">AD (After Dinner)</span>}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
