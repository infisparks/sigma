"use client"

import { useState, useEffect, useCallback } from 'react';
import { supabase } from "@/lib/supabase";



export function useMedicineMaster() {
    const [masterList, setMasterList] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const fetchMaster = useCallback(async () => {
        setIsSyncing(true);
        try {
            const { data, error } = await supabase
                .from('opd_medicine')
                .select('id, medicine_name')
                .order('medicine_name');

            if (error) throw error;

            if (data) {
                setMasterList(data);
            }
        } catch (err) {
            console.error("Failed to fetch medicine master:", err);
        } finally {
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, []);

    useEffect(() => {
        fetchMaster();
    }, [fetchMaster]);

    const addToMaster = useCallback(async (medicineName: string) => {
        if (!medicineName) return;

        // Check if already in local list (case insensitive)
        const exists = masterList.some(m => m.medicine_name.toLowerCase() === medicineName.toLowerCase());
        if (exists) return;

        try {
            const { data, error } = await supabase
                .from('opd_medicine')
                .insert([{ medicine_name: medicineName.toUpperCase() }])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                // Update local state immediately for better UX
                setMasterList(prev => [...prev, data].sort((a, b) => a.medicine_name.localeCompare(b.medicine_name)));
            }
        } catch (err) {
            console.error("Failed to add medicine to master:", err);
        }
    }, [masterList]);

    const searchMedicines = useCallback((query: string) => {
        if (!query) return masterList.slice(0, 30);
        const lowerQuery = query.toLowerCase();
        return masterList
            .filter(m => m.medicine_name.toLowerCase().includes(lowerQuery))
            .slice(0, 30);
    }, [masterList]);

    return {
        masterList,
        isLoading,
        isSyncing,
        searchMedicines,
        addToMaster,
        refreshMaster: fetchMaster
    };
}
