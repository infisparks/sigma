"use client"

import React, { useState, useEffect } from 'react';
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, History, Calendar, User, Stethoscope, IndianRupee } from 'lucide-react';
import { format } from "date-fns"
import { useRouter } from "next/navigation"

interface HistoricalRecord {
    id: number;
    created_at: string;
    treating_doctor_id: number;
    visit_category: string;
    total_fees: number;
    amount_paid: number;
    is_finalized: boolean;
    hospital_name: string;
    doctor_name?: string;
}

interface PatientHistoryModalProps {
    uhid: string;
    patientName: string;
    onClose: () => void;
}

const PatientHistoryModal: React.FC<PatientHistoryModalProps> = ({ uhid, patientName, onClose }) => {
    const router = useRouter();
    const [history, setHistory] = useState<HistoricalRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // 1. Fetch Doctor Config for mapping names
                const { data: doctorConfig } = await supabase.from('config_data')
                    .select('data')
                    .eq('data_heading', 'opd_doctor_data')
                    .single();
                
                const doctorList = (doctorConfig?.data as any[]) ?? [];

                // 2. Fetch OPD Records for this UHID
                const { data, error: fetchError } = await supabase
                    .from('opd_registration')
                    .select('*')
                    .eq('uhid', uhid)
                    .order('created_at', { ascending: false });

                if (fetchError) throw fetchError;

                const mappedHistory: HistoricalRecord[] = (data || []).map(r => ({
                    ...r,
                    doctor_name: doctorList.find(d => d.id === r.treating_doctor_id)?.doctor_name || 'Unknown Doctor'
                }));

                setHistory(mappedHistory);
            } catch (err: any) {
                console.error("Error fetching history:", err);
                setError(err.message || "Failed to load visit history.");
            } finally {
                setIsLoading(false);
            }
        };

        if (uhid) {
            fetchHistory();
        }
    }, [uhid]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader className="border-b pb-4">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                            <History className="h-6 w-6 text-amber-500" />
                            Visit History
                        </DialogTitle>
                        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <DialogDescription className="mt-2">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                                <User className="h-3.5 w-3.5" />
                                {patientName}
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full font-medium">
                                <span className="text-[10px] uppercase tracking-wider text-slate-400">UHID:</span>
                                {uhid}
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full font-medium">
                                <Calendar className="h-3.5 w-3.5" />
                                {history.length} Total Visits
                            </div>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Loader2 className="h-10 w-10 animate-spin mb-4 text-blue-200" />
                            <p className="animate-pulse">Fetching history...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-10 text-red-500 bg-red-50 rounded-lg border border-red-100 m-4">
                            <X className="h-8 w-8 mx-auto mb-2" />
                            <p className="font-medium">{error}</p>
                            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-4">Try Again</Button>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-20 text-slate-500">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <History className="h-8 w-8 text-slate-200" />
                            </div>
                            <p className="text-lg font-medium text-slate-700">No past visits recorded</p>
                            <p className="text-sm text-slate-400 mt-1">This appears to be the patient's first registration.</p>
                        </div>
                    ) : (
                        <div className="px-1">
                            <Table>
                                <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="w-[180px]">Date & Time</TableHead>
                                        <TableHead>Doctor & Category</TableHead>
                                        <TableHead>Hospital</TableHead>
                                        <TableHead className="text-right">Fees Paid</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((r) => (
                                        <TableRow 
                                            key={r.id} 
                                            className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                                            onClick={() => router.push(`/pathology/opd/${r.id}/prescription`)}
                                        >
                                            <TableCell className="font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                                                <div className="flex flex-col">
                                                    <span>{format(new Date(r.created_at), 'dd MMM yyyy')}</span>
                                                    <span className="text-[10px] text-slate-400">{format(new Date(r.created_at), 'hh:mm a')}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <Stethoscope className="h-3 w-3 text-blue-500" />
                                                        <span className="text-sm font-semibold text-slate-800">{r.doctor_name}</span>
                                                    </div>
                                                    <Badge variant="secondary" className="w-fit text-[10px] px-1.5 py-0 mt-1 bg-slate-100 text-slate-600 font-normal">
                                                        {r.visit_category}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-600 text-sm">
                                                {r.hospital_name || '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center text-emerald-700 font-bold">
                                                        <IndianRupee className="h-3 w-3 mr-0.5" />
                                                        {r.amount_paid}
                                                    </div>
                                                    {r.total_fees > r.amount_paid && (
                                                        <span className="text-[10px] text-amber-600">
                                                            Due: ₹{r.total_fees - r.amount_paid}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {r.is_finalized ? (
                                                    <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-100 font-medium">Finalized</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-slate-400 font-normal border-slate-200">Draft</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div className="border-t p-4 flex justify-end bg-slate-50/50">
                    <Button variant="outline" onClick={onClose} className="px-6">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PatientHistoryModal;
