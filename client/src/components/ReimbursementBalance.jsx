import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function ReimbursementBalance() {
    const [unlinked, setUnlinked] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from("transactions")
            .select("id, merchant, amount, date")
            .eq("category", "Reimbursement")
            .eq("user_id", user.id)
            .is("parent_id", null)
            .order("date", { ascending: false });

        setUnlinked(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        window.addEventListener("focus", fetchData);
        return () => window.removeEventListener("focus", fetchData);
    }, [fetchData]);

    const total = unlinked.reduce((s, tx) => s + (tx.amount || 0), 0);
    const fmt = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(n);

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden flex flex-col h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Reimbursements</h2>
                <p className="text-sm text-gray-500 mt-0.5">Unreconciled items</p>
            </div>

            <div className="px-6 py-5 flex-1 flex flex-col">
                {!loading && unlinked.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
                        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-green-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-500">All clear</p>
                    </div>
                ) : (
                    <>
                        <div className="mb-4">
                            <span className="text-3xl font-semibold text-violet-500 tracking-tight">{fmt(total)}</span>
                            <span className="text-sm text-gray-400 ml-2">outstanding</span>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1 divide-y divide-gray-50">
                            {unlinked.map(tx => (
                                <div key={tx.id} className="flex justify-between items-center py-2">
                                    <span className="text-sm text-gray-700 truncate max-w-[65%]">{tx.merchant}</span>
                                    <span className="text-sm font-semibold text-gray-800">{fmt(tx.amount)}</span>
                                </div>
                            ))}
                        </div>

                        <Link
                            to="/reconcile"
                            className="mt-4 block text-center text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors py-2 border border-indigo-100 rounded-xl hover:bg-indigo-50"
                        >
                            Reconcile →
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
