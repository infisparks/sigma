"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    Search, User, Calendar, Filter,
    ArrowLeft, ArrowRight, Pill, X,
    Phone, Hash, Clock, CheckCircle2
} from "lucide-react"
import { useRouter } from "next/navigation"

// --- Types ---
interface PrescriptionEntry {
    id: string;
    name: string;
    type: string;
    dosage: string;
    duration: string;
    note: string;
    timing: {
        bb: boolean; ab: boolean;
        bl: boolean; al: boolean;
        bd: boolean; ad: boolean;
    };
}

interface PharmacyRecord {
    id: number;
    uhid: string;
    created_at: string;
    rx_list_json: PrescriptionEntry[];
    patient_name: string;
    patient_number: string;
    doctor_name?: string;
}

type DateFilterType = 'today' | 'yesterday' | 'all';

// --- Helper Functions ---
function formatDate(isoString: string): string {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return '-';
    }
}

const getTodayRange = () => {
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    return { start, end };
}

const getYesterdayRange = () => {
    const now = new Date();
    const yesterday = new Date(now.setDate(now.getDate() - 1));
    const start = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
    return { start, end };
}

export default function PharmacyPage() {
    const router = useRouter();

    // --- State ---
    const [records, setRecords] = useState<PharmacyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<DateFilterType>('today');
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(0);
    const pageSize = 10;

    // --- Fetch Logic ---
    const fetchPharmacyData = useCallback(async () => {
        setLoading(true);
        try {
            let start: string | null = null;
            let end: string | null = null;

            if (filterType === 'today') {
                const r = getTodayRange();
                start = r.start;
                end = r.end;
            } else if (filterType === 'yesterday') {
                const r = getYesterdayRange();
                start = r.start;
                end = r.end;
            }

            let query = supabase
                .from('opd_registration')
                .select(`
                    id, uhid, created_at, rx_list_json, is_finalized,
                    patient_detail (name, number)
                `)
                .eq('is_finalized', true)
                .not('rx_list_json', 'is', null)
                .order('created_at', { ascending: false });

            if (start && end) {
                query = query.gte('created_at', start).lte('created_at', end);
            }

            const { data, error } = await query;
            if (error) throw error;

            const mapped: PharmacyRecord[] = (data ?? [])
                .filter((r: any) => Array.isArray(r.rx_list_json) && r.rx_list_json.length > 0)
                .map((r: any) => ({
                    id: r.id,
                    uhid: r.uhid,
                    created_at: r.created_at,
                    rx_list_json: r.rx_list_json,
                    patient_name: r.patient_detail?.name || 'Unknown',
                    patient_number: String(r.patient_detail?.number || ''),
                }));

            setRecords(mapped);
        } catch (err) {
            console.error("Pharmacy Fetch Error:", err);
        } finally {
            setLoading(false);
        }
    }, [filterType]);

    useEffect(() => {
        fetchPharmacyData();
    }, [fetchPharmacyData]);

    // --- Search & Display Logic ---
    const displayedRecords = useMemo(() => {
        if (!searchInput) return records;
        const lower = searchInput.toLowerCase();
        return records.filter(r =>
            r.patient_name.toLowerCase().includes(lower) ||
            r.patient_number.includes(lower) ||
            r.uhid.toLowerCase().includes(lower)
        );
    }, [records, searchInput]);

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 space-y-6 pb-20 md:pb-8">
            {/* --- Header --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-2 bg-blue-600 rounded-lg shadow-md shadow-blue-200">
                            <Pill className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Pharmacy Queue</h1>
                    </div>
                    <p className="text-slate-500 text-xs md:text-sm">Dispense medicines for finalized OPD prescriptions.</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto overflow-x-auto">
                    {(['today', 'yesterday', 'all'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilterType(t)}
                            className={`flex-1 md:flex-none px-4 py-2 text-xs md:text-sm font-bold rounded-lg transition-all whitespace-nowrap ${filterType === t
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-500 hover:bg-slate-50'
                                }`}
                        >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- Search & Stats --- */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 md:gap-6">
                <div className="xl:col-span-3">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Search Patient, Phone, UHID..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="pl-12 h-12 md:h-14 bg-white border-slate-200 rounded-2xl shadow-sm text-base md:text-lg focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                        {searchInput && (
                            <button
                                onClick={() => setSearchInput('')}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="h-5 w-5 text-slate-400" />
                            </button>
                        )}
                    </div>
                </div>

                <Card className="bg-blue-600 border-none shadow-lg shadow-blue-200 rounded-2xl">
                    <CardContent className="p-5 md:p-6 flex items-center justify-between">
                        <div className="text-white">
                            <p className="text-blue-100 text-xs font-medium uppercase tracking-wider">Pending Dispense</p>
                            <h3 className="text-2xl md:text-3xl font-black mt-1">{displayedRecords.length}</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                            <Clock className="w-6 h-6 md:w-8 md:h-8 text-white" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* --- Content Area --- */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-medium text-sm">Fetching prescriptions...</p>
                </div>
            ) : displayedRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                    <div className="p-4 bg-slate-100 rounded-full">
                        <Search className="w-8 h-8 text-slate-300" />
                    </div>
                    <div>
                        <p className="text-slate-900 font-bold text-lg">No prescriptions found</p>
                        <p className="text-slate-400 text-sm">Try adjusting your search or filters.</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Mobile/Tablet: Card List View */}
                    <div className="grid grid-cols-1 gap-4">
                        {displayedRecords.map((record) => (
                            <div key={record.id} className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 hover:border-blue-200 transition-all">
                                {/* Header: Patient Info & Action */}
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4 md:mb-6 border-b border-slate-50 pb-4 md:pb-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                            <User className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg md:text-xl font-black text-slate-900 leading-tight">{record.patient_name}</h3>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                                <div className="flex items-center gap-1.5 text-slate-500">
                                                    <Phone className="w-3 h-3" />
                                                    <span className="text-xs font-bold">{record.patient_number}</span>
                                                </div>
                                                <div className="hidden md:block w-1 h-1 rounded-full bg-slate-300"></div>
                                                <div className="flex items-center gap-1.5 text-slate-400">
                                                    <Hash className="w-3 h-3" />
                                                    <span className="text-[10px] font-black tracking-wider uppercase">{record.uhid}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 pl-14 md:pl-0">
                                        <div className="text-right">
                                            <div className="text-xs md:text-sm font-bold text-slate-900">{formatDate(record.created_at)}</div>
                                            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-end gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Finalized
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-200"
                                            onClick={() => window.print()}
                                        >
                                            Dispense
                                        </Button>
                                    </div>
                                </div>

                                {/* Medicine Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {record.rx_list_json.map((med, idx) => (
                                        <div key={idx} className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 md:p-4 hover:bg-white hover:shadow-sm transition-all">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="min-w-0">
                                                    <Badge variant="secondary" className="bg-white text-blue-600 text-[9px] font-black uppercase mb-1 border border-blue-100">
                                                        {med.type}
                                                    </Badge>
                                                    <div className="font-bold text-slate-900 text-sm truncate pr-2">{med.name}</div>
                                                </div>
                                                <div className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg whitespace-nowrap">
                                                    {med.duration}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-slate-200/50">
                                                <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-100">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                    <span className="text-[10px] font-bold text-slate-700">{med.dosage} Dose</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {Object.entries(med.timing).map(([key, val]) => val && (
                                                        <span key={key} className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-1 rounded uppercase">
                                                            {key}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            {med.note && (
                                                <div className="mt-2 text-[10px] text-slate-400 italic truncate">
                                                    Note: {med.note}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

