"use client"

import { useState, useEffect, useCallback } from 'react';
import { supabase } from "@/lib/supabase";

const CACHE_KEY = 'opd_medicine_cache';
const CACHE_TIME_KEY = 'opd_medicine_cache_time';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

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
                localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            }
        } catch (err) {
            console.error("Failed to fetch medicine master:", err);
        } finally {
            setIsLoading(false);
            setIsSyncing(false);
        }
    }, []);

    useEffect(() => {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        const now = Date.now();

        if (cachedData && cachedTime && (now - parseInt(cachedTime)) < CACHE_DURATION) {
            try {
                const parsed = JSON.parse(cachedData);
                setMasterList(parsed);
                setIsLoading(false);

                // Still background sync if it's been more than 1 hour
                if ((now - parseInt(cachedTime)) > 60 * 60 * 1000) {
                    fetchMaster();
                }
            } catch (e) {
                fetchMaster();
            }
        } else {
            fetchMaster();
        }
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
                // Also update cache
                const cachedData = localStorage.getItem(CACHE_KEY);
                if (cachedData) {
                    const parsed = JSON.parse(cachedData);
                    localStorage.setItem(CACHE_KEY, JSON.stringify([...parsed, data]));
                }
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
