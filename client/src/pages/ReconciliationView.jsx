import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ReconciliationView() {
    const [reimbursements, setReimbursements] = useState([]);
    const [potentialParents, setPotentialParents] = useState([]);
    const [selectedChild, setSelectedChild] = useState(null);
    const [auditParentId, setAuditParentId] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [loading, setLoading] = useState(false);

    const categories = ["Restaurant", "Groceries", "Transportation", "Bill Payment", "Shopping", "Other"];

    // 1. Fetch ALL reimbursements from user
    const loadReimbursements = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from("transactions")
            .select(`*, parent:parent_id (merchant)`)
            .eq("category", "Reimbursement")
            .eq("user_id", user.id)           // ← add this
            .order("date", { ascending: false });

        if (!error) setReimbursements(data || []);
    };

    // 2. Fetch potential parent expenses based on search/filters
    const loadParents = async () => {
        if (!selectedChild) return;
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();  // ← add this
        if (!user) return;

        let query = supabase
            .from("transactions")
            .select("*")
            .eq("type", "Expense")
            .is("parent_id", null)
            .neq("id", selectedChild.id)
            .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);  // ← add this

        if (searchTerm) query = query.ilike("merchant", `%${searchTerm}%`);
        if (selectedCategory) query = query.eq("category", selectedCategory);

        const { data } = await query.order("date", { ascending: false }).limit(15);
        setPotentialParents(data || []);
        setLoading(false);
    };

    useEffect(() => { loadReimbursements(); }, []);

    useEffect(() => {
        if (selectedChild) loadParents();
    }, [searchTerm, selectedCategory, selectedChild]);

    const handleLink = async (parentId) => {
        setLoading(true);
        try {
            const { data: parent, error: fetchError } = await supabase
                .from("transactions")
                .select("*")
                .eq("id", parentId)
                .single();

            if (fetchError) throw fetchError;

            // Calculate ratios to maintain the split balance
            const selfRatio = parent.self_amount / (parent.amount || 1);
            const partnerRatio = parent.partner_amount / (parent.amount || 1);

            // New Net Total
            const newTotalAmount = Math.max(0, parent.amount - selectedChild.amount);
            const newSelf = Number((newTotalAmount * selfRatio).toFixed(2));
            const newPartner = Number((newTotalAmount * partnerRatio).toFixed(2));

            // Update Child
            await supabase.from("transactions").update({ parent_id: parentId }).eq("id", selectedChild.id);

            // Update Parent (Amount and Splits)
            await supabase.from("transactions").update({
                amount: newTotalAmount,
                self_amount: newSelf,
                partner_amount: newPartner
            }).eq("id", parentId);

            setSelectedChild(null);
            setSearchTerm("");
            loadReimbursements();
        } catch (err) {
            console.error(err);
            alert("Linking failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUnlink = async (child) => {
        try {
            const { data: parent } = await supabase
                .from("transactions")
                .select("*")
                .eq("id", child.parent_id)
                .single();

            if (parent) {
                const selfRatio = parent.self_amount / (parent.amount || 1);
                const partnerRatio = parent.partner_amount / (parent.amount || 1);

                const restoredAmount = parent.amount + child.amount;
                const newSelf = Number((restoredAmount * selfRatio).toFixed(2));
                const newPartner = Number((restoredAmount * partnerRatio).toFixed(2));

                await supabase.from("transactions").update({
                    amount: restoredAmount,
                    self_amount: newSelf,
                    partner_amount: newPartner
                }).eq("id", child.parent_id);
            }

            await supabase.from("transactions").update({ parent_id: null }).eq("id", child.id);
            loadReimbursements();
        } catch (err) {
            console.error("Unlink error:", err);
        }
    };

    const unlinked = reimbursements.filter(r => !r.parent_id);
    const linked = reimbursements.filter(r => r.parent_id);

    return (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">

            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Reconciliation</h1>
                <p className="text-sm text-gray-500 mt-0.5">Link reimbursements to their original expense.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* --- LEFT SIDE: REIMBURSEMENTS --- */}
                <div className="space-y-6">

                    {/* Needs Linking */}
                    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                Needs Linking
                                {unlinked.length > 0 && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
                                        {unlinked.length}
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {unlinked.length === 0 ? (
                                <p className="px-5 py-8 text-center text-sm text-gray-400">All reimbursements are linked.</p>
                            ) : unlinked.map(tx => (
                                <button
                                    key={tx.id}
                                    onClick={() => setSelectedChild(tx)}
                                    className={`w-full text-left px-5 py-3.5 transition-colors flex justify-between items-center ${
                                        selectedChild?.id === tx.id
                                            ? 'bg-blue-50'
                                            : 'hover:bg-gray-50/60'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-sm font-semibold ${selectedChild?.id === tx.id ? 'text-blue-600' : 'text-gray-900'}`}>
                                            {tx.merchant}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">{tx.date}</p>
                                    </div>
                                    <span className={`text-sm font-semibold ${selectedChild?.id === tx.id ? 'text-blue-600' : 'text-green-600'}`}>
                                        +${tx.amount.toFixed(2)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Linked */}
                    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Linked</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {linked.length === 0 ? (
                                <p className="px-5 py-8 text-center text-sm text-gray-400">No linked reimbursements yet.</p>
                            ) : linked.map(tx => (
                                <div key={tx.id} className="px-5 py-3.5 flex justify-between items-center group hover:bg-gray-50/60 transition-colors">
                                    <div className="overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900 truncate">{tx.merchant}</span>
                                            <button
                                                onClick={() => setAuditParentId(tx.parent_id)}
                                                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors whitespace-nowrap"
                                            >
                                                → {tx.parent?.merchant || 'Parent'}
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">{tx.date} · +${tx.amount.toFixed(2)}</p>
                                    </div>
                                    <button
                                        onClick={() => handleUnlink(tx)}
                                        className="text-sm font-medium text-red-500 hover:text-red-700 ml-4 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        Unlink
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- RIGHT SIDE: SEARCH PANEL --- */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm h-fit sticky top-6 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Link to Expense</p>
                    </div>

                    <div className="p-5">
                        {!selectedChild ? (
                            <div className="text-center py-14 text-gray-400">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-gray-500">Select an unlinked item</p>
                                <p className="text-xs text-gray-400 mt-0.5">to find its matching expense</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Selected reimbursement pill */}
                                <div className="px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Linking For</p>
                                    <p className="text-sm font-semibold text-blue-800 mt-0.5">
                                        {selectedChild.merchant}
                                        <span className="font-normal text-blue-500 ml-1.5">${selectedChild.amount}</span>
                                    </p>
                                </div>

                                {/* Filters */}
                                <input
                                    type="text"
                                    placeholder="Search merchant…"
                                    className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <select
                                    className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                >
                                    <option value="">All Categories</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>

                                {/* Results */}
                                <div className="space-y-1 max-h-[400px] overflow-y-auto -mx-1 px-1">
                                    {loading ? (
                                        <div className="flex justify-center py-8">
                                            <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                            </svg>
                                        </div>
                                    ) : potentialParents.length === 0 ? (
                                        <p className="text-center py-8 text-sm text-gray-400">No unlinked expenses found.</p>
                                    ) : potentialParents.map(parent => (
                                        <div
                                            key={parent.id}
                                            className="flex justify-between items-center px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors group"
                                        >
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                                    {parent.merchant}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {parent.date} · <span className="font-medium text-gray-600">${parent.amount.toFixed(2)}</span>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleLink(parent.id)}
                                                className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors"
                                            >
                                                Link
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Audit Sidebar */}
            {auditParentId && (
                <TransactionAuditSidebar
                    parentId={auditParentId}
                    onClose={() => setAuditParentId(null)}
                />
            )}
        </div>
    );
}

// Sub-component for the Sidebar
function TransactionAuditSidebar({ parentId, onClose }) {
    const [details, setDetails] = useState(null);

    useEffect(() => {
        const fetchAudit = async () => {
            const { data } = await supabase
                .from("transactions")
                .select(`
                    id, merchant, original_amount, amount, self_amount, partner_amount,
                    children: transactions(merchant, amount, date)
                `)
                .eq("id", parentId)
                .single();
            setDetails(data);
        };
        if (parentId) fetchAudit();
    }, [parentId]);

    if (!details) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 border-l border-gray-200/60 flex flex-col animate-in slide-in-from-right duration-300">

                {/* Sidebar Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Expense Audit</p>
                        <h3 className="text-base font-semibold text-gray-900 mt-0.5">{details.merchant}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        Close
                    </button>
                </div>

                {/* Sidebar Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Original Bill</span>
                        <span className="text-sm font-semibold text-gray-900 font-mono">
                            ${(details.original_amount || details.amount).toFixed(2)}
                        </span>
                    </div>

                    {/* Reimbursements */}
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reimbursements</p>
                        <div className="space-y-1 pl-3 border-l-2 border-green-200">
                            {details.children?.length > 0 ? details.children.map((child, i) => (
                                <div key={i} className="flex justify-between items-center py-1">
                                    <span className="text-sm text-gray-700">{child.merchant}</span>
                                    <span className="text-sm font-medium text-green-600 font-mono">−${child.amount.toFixed(2)}</span>
                                </div>
                            )) : (
                                <p className="text-sm text-gray-400 py-1">None linked</p>
                            )}
                        </div>
                    </div>

                    {/* Net Total */}
                    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                        <span className="text-sm font-semibold text-gray-900">Net Total</span>
                        <span className="text-sm font-semibold text-gray-900 font-mono">${details.amount.toFixed(2)}</span>
                    </div>

                    {/* Split */}
                    <div className="bg-blue-50 rounded-2xl p-4 space-y-2.5 border border-blue-100">
                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Current Split</p>
                        <div className="flex justify-between text-sm">
                            <span className="text-blue-600 font-medium">Self</span>
                            <span className="font-semibold text-gray-900 font-mono">${details.self_amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-blue-600 font-medium">Partner</span>
                            <span className="font-semibold text-gray-900 font-mono">${details.partner_amount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
