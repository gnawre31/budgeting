import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { cacheGet, cacheSet, cacheKey } from "../lib/queryCache";

const MAX_VIS = 4;
const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(n);

export default function ReimbursementWidget() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (bust = false) => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const key = cacheKey(user.id, "reimbursements");
        if (!bust) {
            const cached = cacheGet(key);
            if (cached) { setItems(cached); setLoading(false); return; }
        }

        const { data, error } = await supabase
            .from("transactions")
            .select("id, merchant, amount, partner_amount, self_amount, user_id, date, description, linked_category")
            .eq("category", "Reimbursement")
            .is("parent_id", null)
            .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`)
            .order("date", { ascending: false });

        if (error) { console.error(error); setLoading(false); return; }

        const normalised = (data || []).filter(tx => !tx.linked_category).map(tx => ({
            id: tx.id,
            merchant: tx.merchant,
            date: tx.date,
            description: tx.description,
            amount: tx.user_id === user.id ? tx.amount : tx.partner_amount,
            isPartner: tx.user_id !== user.id,
        }));

        cacheSet(key, normalised, 30 * 60 * 1000); // 30-min TTL — reconcile actions should bust anyway
        setItems(normalised);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        const onFocus = () => fetchData(true);
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [fetchData]);

    const total = items.reduce((s, tx) => s + (tx.amount || 0), 0);
    const overflow = Math.max(0, items.length - MAX_VIS);
    const visible = overflow > 0 ? items.slice(0, MAX_VIS) : items;

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm relative overflow-hidden flex flex-col h-full">
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
            )}

            <div className="px-4 sm:px-6 py-5 border-b border-gray-100 flex items-start justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Reimbursements</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Unreconciled items</p>
                </div>
                {items.length > 0 && (
                    <Link to="/reconcile" className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors px-3 py-1.5 border border-indigo-100 rounded-xl hover:bg-indigo-50 whitespace-nowrap mt-0.5">
                        Reconcile →
                    </Link>
                )}
            </div>

            <div className="px-4 sm:px-6 py-3 flex-1 flex flex-col">
                {!loading && items.length === 0 ? (
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
                        <div className="mb-3">
                            <span className="text-3xl font-semibold text-violet-500 tracking-tight">{fmt(total)}</span>
                            <span className="text-sm text-gray-400 ml-2">outstanding</span>
                        </div>

                        <div className="divide-y divide-gray-50">
                            {visible.map(tx => (
                                <div key={tx.id} className="flex justify-between items-start py-2 gap-2">
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm text-gray-700 truncate">{tx.merchant}</span>
                                            {tx.isPartner && (
                                                <span className="shrink-0 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">partner</span>
                                            )}
                                        </div>
                                        {tx.description && (
                                            <span className="text-xs text-gray-400 truncate">{tx.description}</span>
                                        )}
                                        <span className="text-[11px] text-gray-300">{tx.date}</span>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-800 pl-2 shrink-0">{fmt(tx.amount)}</span>
                                </div>
                            ))}
                            {overflow > 0 && (
                                <Link to="/reconcile" className="flex items-center justify-center py-2.5 text-xs font-medium text-gray-400 hover:text-indigo-500 transition-colors">
                                    +{overflow} more
                                </Link>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
