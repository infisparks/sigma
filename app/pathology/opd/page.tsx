// @/app/opd/opd-dashboard/page.tsx
"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase" // Assuming this path is correct
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// FIX: Added FilePenLine import
import { Filter, Search, User, Calendar, Stethoscope, ArrowLeft, ArrowRight, FilePenLine } from "lucide-react" 
import { useRouter } from "next/navigation"

// Import the new Edit Modal 
import OPDRecordEditModal from "./OPDRecordEditModal"

// --- Types & Constants ---
const TABLE = {
  OPD_REGISTRATION: "opd_registration", 
  PATIENT: "patient_detail",
  CONFIG: "config_data",
} as const

interface OPDRecord {
    id: number;
    uhid: string;
    treating_doctor_id: number;
    total_fees: number;
    amount_paid: number;
    created_at: string; // ISO date string
    patient_name?: string; // Joined from patient_detail
    doctor_name?: string; // Joined from config_data
    referring_doctor_name: string;
}

// FIX: Define the full DoctorFee structure required by the Modal
interface DoctorFee {
    id: number; 
    doctor_name: string;
    first_visit_fee: number; // Required by OPDRecordEditModal
    follow_up_fee: number; // Required by OPDRecordEditModal
}

// Helper to format ISO date string to a readable date/time
function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

// Initial date range (e.g., last 7 days)
const defaultEndDate = new Date().toISOString().split('T')[0];
const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];


// --- Main Component ---
export default function OPDDashboard() {
    const router = useRouter();
    const [records, setRecords] = useState<OPDRecord[]>([]);
    const [doctorList, setDoctorList] = useState<DoctorFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // State for Edit Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

    // --- Filters & Pagination State ---
    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(0);
    const pageSize = 10;

    // --- Data Fetching Logic ---
    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Fetch Doctor List (with fees, since it's needed for the modal)
            const { data: doctorConfig, error: dcErr } = await supabase.from(TABLE.CONFIG)
                .select('data')
                .eq('data_heading', 'opd_doctor_data')
                .single();
            const fetchedDoctors = (doctorConfig?.data as DoctorFee[]) ?? [];
            setDoctorList(fetchedDoctors);

            // 2. Fetch OPD Records with Patient Data
            let query = supabase
                .from(TABLE.OPD_REGISTRATION)
                .select(`
                    id, uhid, treating_doctor_id, total_fees, amount_paid, created_at, referring_doctor_name,
                    ${TABLE.PATIENT} (name)
                `)
                .gte('created_at', `${startDate}T00:00:00.000Z`)
                .lte('created_at', `${endDate}T23:59:59.999Z`)
                .order('created_at', { ascending: false })
                .limit(pageSize)
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (selectedDoctorId && selectedDoctorId !== '0') { 
                query = query.eq('treating_doctor_id', Number(selectedDoctorId));
            }

            const { data: opdRecords, error: opdError } = await query;

            if (opdError) throw opdError;

            // 3. Map records to include patient name and doctor name
            const mappedRecords: OPDRecord[] = (opdRecords ?? []).map((r: any) => ({
                id: r.id,
                uhid: r.uhid,
                treating_doctor_id: r.treating_doctor_id,
                total_fees: r.total_fees,
                amount_paid: r.amount_paid,
                created_at: r.created_at,
                referring_doctor_name: r.referring_doctor_name,
                patient_name: r[TABLE.PATIENT]?.name || 'N/A', // Access joined patient name
                doctor_name: fetchedDoctors.find(d => d.id === r.treating_doctor_id)?.doctor_name || 'Unknown Doctor',
            }));

            setRecords(mappedRecords);
        } catch (err: any) {
            console.error("Error fetching OPD data:", err);
            setError(err.message || "Failed to fetch dashboard data.");
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedDoctorId, page]);


    useEffect(() => {
        fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startDate, endDate, selectedDoctorId, page]);

    // --- Filtering by Search Term (Client-side for simplicity) ---
    const filteredRecords = useMemo(() => {
        if (!searchTerm) return records;
        const lowerSearchTerm = searchTerm.toLowerCase();
        return records.filter(r => 
            r.uhid.toLowerCase().includes(lowerSearchTerm) ||
            r.patient_name?.toLowerCase().includes(lowerSearchTerm) ||
            r.doctor_name?.toLowerCase().includes(lowerSearchTerm)
        );
    }, [records, searchTerm]);

    const handleFilterChange = () => {
        if (page !== 0) {
            setPage(0);
        } else {
            fetchDashboardData();
        }
    }

    const doctorOptions = useMemo(() => {
        // ID 0 represents "All Doctors"
        return [{ id: 0, doctor_name: "All Doctors", first_visit_fee: 0, follow_up_fee: 0 }, ...doctorList]
    }, [doctorList]);

    // Handler to open the modal
    const handleEditClick = (id: number) => {
        setSelectedRecordId(id);
        setIsModalOpen(true);
    };

    // Handler to close the modal and refresh data
    const handleCloseModal = (shouldRefresh: boolean) => {
        setIsModalOpen(false);
        setSelectedRecordId(null);
        if (shouldRefresh) {
            fetchDashboardData();
        }
    };


    return (
        <div className="p-3">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-3 flex items-center"><User className="mr-2 w-6 h-6 text-blue-600" />OPD Registration Dashboard</h1>
            
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center"><Filter className="mr-2 h-5 w-5" /> Filter Options</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {/* Date Range Filters */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={handleFilterChange} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onBlur={handleFilterChange} />
                        </div>
                        
                        {/* Doctor Filter */}
                        <div className="col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
                            <Select 
                                value={selectedDoctorId} 
                                onValueChange={(v) => { setSelectedDoctorId(v); handleFilterChange(); }}
                            >
                                <SelectTrigger><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                    {doctorOptions.map((d) => (
                                        <SelectItem key={d.id} value={String(d.id)}>{d.doctor_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Search Bar */}
                        <div className="md:col-span-2 relative">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Search (UHID, Name, Doctor)</label>
                            <Input 
                                type="text" 
                                placeholder="Search here..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                            <Search className="absolute left-2 top-8 h-4 w-4 text-gray-400" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-4">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center"><Calendar className="mr-2 h-5 w-5" /> OPD Entries ({filteredRecords.length} shown)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-10">Loading OPD data...</div>
                        ) : error ? (
                            <div className="text-center py-10 text-red-600 font-medium">Error: {error}</div>
                        ) : filteredRecords.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">No OPD registrations found for the selected criteria.</div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-gray-100">
                                                <TableHead>OPD ID</TableHead>
                                                <TableHead>Date/Time</TableHead>
                                                <TableHead>UHID</TableHead>
                                                <TableHead>Patient Name</TableHead>
                                                <TableHead>Treating Doctor</TableHead>
                                                <TableHead>Fees</TableHead>
                                                <TableHead>Paid</TableHead>
                                                <TableHead>Due</TableHead>
                                                <TableHead>Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredRecords.map((r) => (
                                                <TableRow key={r.id} className="hover:bg-blue-50">
                                                    <TableCell className="font-semibold text-blue-600">{r.id}</TableCell>
                                                    <TableCell>{formatDate(r.created_at)}</TableCell>
                                                    <TableCell>{r.uhid}</TableCell>
                                                    <TableCell className="font-medium">{r.patient_name}</TableCell>
                                                    <TableCell className="text-green-700">{r.doctor_name}</TableCell>
                                                    <TableCell className="text-right">₹{r.total_fees.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right text-green-600">₹{r.amount_paid.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right font-bold text-red-600">₹{(r.total_fees - r.amount_paid).toFixed(2)}</TableCell>
                                                    {/* Edit Button */}
                                                    <TableCell>
                                                        <Button 
                                                            variant="secondary" 
                                                            size="sm" 
                                                            onClick={() => handleEditClick(r.id)}
                                                            className="h-8 px-2"
                                                        >
                                                            <FilePenLine className="h-4 w-4 mr-1" /> Edit
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                        <TableCaption>A list of recent OPD registrations.</TableCaption>
                                    </Table>
                                </div>
                                
                                {/* Pagination Controls */}
                                <div className="flex justify-between items-center mt-4">
                                    <Button 
                                        onClick={() => setPage(p => Math.max(0, p - 1))} 
                                        disabled={page === 0 || loading}
                                        variant="outline"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-2" /> Previous
                                    </Button>
                                    <span className="text-sm text-gray-600">Page {page + 1}</span>
                                    <Button 
                                        onClick={() => setPage(p => p + 1)} 
                                        disabled={filteredRecords.length < pageSize || loading}
                                        variant="outline"
                                    >
                                        Next <ArrowRight className="h-4 w-4 ml-2" />
                                    </Button>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            {/* Edit Modal Component */}
            {isModalOpen && selectedRecordId !== null && (
                <OPDRecordEditModal
                    opdId={selectedRecordId}
                    doctorList={doctorList}
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
}