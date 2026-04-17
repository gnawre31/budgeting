import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { createCategorizationRule } from "../services/transactionService";

const TYPE_OPTIONS = ["Income", "Expense"];
const CATEGORY_OPTIONS = ["Other", "Restaurant", "Groceries", "Transportation", "Bill Payment", "Entertainment", "Shopping", "Rent", "Utilities", "Credit Card Payment", "Internal Transfer", "Salary", "Freelance", "E-Transfer", "Reimbursement", "Gift"];

const inputCls = "w-full bg-transparent outline-none py-1 px-1.5 rounded-md text-sm transition-colors focus:bg-gray-100";

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pendingChanges, setPendingChanges] = useState({});
    const [editingCell, setEditingCell] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showParentModal, setShowParentModal] = useState(false);
    const [activeChildId, setActiveChildId] = useState(null);
    const [potentialParents, setPotentialParents] = useState([]);

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkCategory, setBulkCategory] = useState("");

    const [ruleSuggestion, setRuleSuggestion] = useState(null);
    const [ruleCreating, setRuleCreating] = useState(false);

    const [filters, setFilters] = useState({ search: "", type: "", category: "", startDate: "", endDate: "", minAmount: "", maxAmount: "" });

    const [showInsertModal, setShowInsertModal] = useState(false);
    const today = new Date().toISOString().split('T')[0];
    const emptyForm = { date: today, merchant: "", type: "Expense", category: "Other", amount: "", self_amount: "", partner_amount: "", exclude_from_report: false, description: "" };
    const [insertForm, setInsertForm] = useState(emptyForm);
    const [inserting, setInserting] = useState(false);

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase.from("transactions")
            .select(`*, parent:parent_id(merchant, amount, original_amount)`)
            .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

        if (filters.search) query = query.ilike("merchant", `%${filters.search}%`);
        if (filters.type) query = query.eq("type", filters.type);
        if (filters.category) query = query.eq("category", filters.category);
        if (filters.startDate) query = query.gte("date", filters.startDate);
        if (filters.endDate) query = query.lte("date", filters.endDate);
        if (filters.minAmount) query = query.gte("amount", filters.minAmount);
        if (filters.maxAmount) query = query.lte("amount", filters.maxAmount);

        const { data, error } = await query.order("date", { ascending: false }).limit(150);
        if (error) console.error(error);

        setTransactions((data || []).map(tx => {
            if (tx.user_id !== user.id && tx.partner_id === user.id) {
                return { ...tx, _isFlipped: true, self_amount: tx.partner_amount, partner_amount: tx.self_amount };
            }
            return { ...tx, _isFlipped: false };
        }));
        setPendingChanges({});
        setSelectedIds(new Set());
        setLoading(false);
    }, [filters]);

    useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

    const getReimbursementTotal = (parentId) =>
        transactions.reduce((sum, other) => {
            const changes = pendingChanges[other.id] || {};
            if ((changes.parent_id ?? other.parent_id) === parentId) {
                return sum + Math.abs((changes.amount !== undefined ? changes.amount : other.amount) || 0);
            }
            return sum;
        }, 0);

    const stageChange = (id, field, value) => {
        const tx = transactions.find(t => t.id === id);
        const current = pendingChanges[id] || {};
        const getVal = (f) => current[f] !== undefined ? current[f] : (tx[f] || 0);

        let updates = { ...current, [field]: value };

        if (field === "amount") { updates.self_amount = value; updates.partner_amount = 0; }
        else if (field === "self_amount") updates.partner_amount = Number((getVal("amount") - value).toFixed(2));
        else if (field === "partner_amount") updates.self_amount = Number((getVal("amount") - value).toFixed(2));
        if (field === "type" && value === "Income") updates.category = "Reimbursement";

        if (field === "category" && tx && value !== tx.category) {
            setRuleSuggestion({ merchant: current.merchant ?? tx.merchant, type: current.type ?? tx.type, category: value });
        }

        Object.keys(updates).forEach(k => { if (updates[k] === tx[k]) delete updates[k]; });
        setPendingChanges(prev => {
            const next = { ...prev };
            if (Object.keys(updates).length > 0) next[id] = updates;
            else delete next[id];
            return next;
        });
    };

    const toggleSelect = (id) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => setSelectedIds(
        selectedIds.size === transactions.length ? new Set() : new Set(transactions.map(t => t.id))
    );
    const handleBulkRecategorize = () => {
        if (!bulkCategory) return;
        selectedIds.forEach(id => stageChange(id, "category", bulkCategory));
        setSelectedIds(new Set()); setBulkCategory("");
    };

    const handleCreateRule = async () => {
        if (!ruleSuggestion) return;
        setRuleCreating(true);
        try {
            await createCategorizationRule({ keyword: ruleSuggestion.merchant, transaction_type: ruleSuggestion.type, category: ruleSuggestion.category, rename_to: "" });
            setRuleSuggestion(null);
        } catch (err) { alert(err.message); }
        finally { setRuleCreating(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Permanently delete this transaction?")) return;
        setLoading(true);
        try {
            const { error } = await supabase.from("transactions").delete().eq("id", id);
            if (error) throw error;
            await fetchTransactions();
        } catch (err) { alert(err.message); setLoading(false); }
    };

    const handleInsertField = (field, value) => {
        setInsertForm(prev => {
            const next = { ...prev, [field]: value };
            if (field === "amount") { const n = parseFloat(value) || 0; next.self_amount = String(n); next.partner_amount = "0"; }
            else if (field === "self_amount") next.partner_amount = String(Math.max(0, Number(((parseFloat(prev.amount) || 0) - (parseFloat(value) || 0)).toFixed(2))));
            else if (field === "partner_amount") next.self_amount = String(Math.max(0, Number(((parseFloat(prev.amount) || 0) - (parseFloat(value) || 0)).toFixed(2))));
            else if (field === "type" && value === "Income") next.category = "Reimbursement";
            return next;
        });
    };

    const handleInsertSubmit = async () => {
        if (!insertForm.merchant.trim() || !insertForm.amount) return;
        setInserting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const amount = Math.abs(parseFloat(insertForm.amount));
            const { error } = await supabase.from("transactions").insert({
                user_id: user.id,
                date: insertForm.date,
                merchant: insertForm.merchant.trim(),
                merchant_normalized: insertForm.merchant.trim().toLowerCase(),
                type: insertForm.type,
                category: insertForm.category,
                amount,
                self_amount: parseFloat(insertForm.self_amount) || amount,
                partner_amount: parseFloat(insertForm.partner_amount) || 0,
                original_amount: amount,
                exclude_from_report: insertForm.exclude_from_report,
                description: insertForm.description || null,
            });
            if (error) throw error;
            setShowInsertModal(false);
            setInsertForm(emptyForm);
            await fetchTransactions();
        } catch (err) { alert(err.message); }
        finally { setInserting(false); }
    };

    const handleConfirmSave = async () => {
        setLoading(true);
        try {
            const affectedIds = new Set(Object.keys(pendingChanges));
            Object.keys(pendingChanges).forEach(id => {
                const tx = transactions.find(t => t.id === id);
                if (tx?.parent_id) affectedIds.add(tx.parent_id);
                if (pendingChanges[id]?.parent_id) affectedIds.add(pendingChanges[id].parent_id);
            });

            for (const id of affectedIds) {
                const tx = transactions.find(t => t.id === id);
                if (!tx) continue;
                const changes = pendingChanges[id] || {};
                const curCat = changes.category ?? tx.category;
                const isReimb = curCat === "Reimbursement";
                const hasLinks = transactions.some(t => (pendingChanges[t.id]?.parent_id ?? t.parent_id) === id);
                const base = Math.abs(tx.original_amount ?? tx.amount);
                const reimbTotal = getReimbursementTotal(id);

                const finalAmount = isReimb
                    ? Math.abs(changes.amount !== undefined ? changes.amount : tx.amount)
                    : hasLinks
                        ? (changes.amount !== undefined ? Math.abs(changes.amount) : Math.max(0, base - reimbTotal))
                        : Math.abs(changes.amount !== undefined ? changes.amount : tx.amount);

                let finalSelf = Math.abs(changes.self_amount !== undefined ? changes.self_amount : (tx.self_amount ?? 0));
                let finalPartner = Math.abs(changes.partner_amount !== undefined ? changes.partner_amount : (tx.partner_amount ?? 0));
                if (Math.abs(finalAmount - (finalSelf + finalPartner)) > 0.01) { finalSelf = finalAmount; finalPartner = 0; }

                const payload = {
                    ...changes,
                    amount: finalAmount,
                    self_amount: tx._isFlipped ? finalPartner : finalSelf,
                    partner_amount: tx._isFlipped ? finalSelf : finalPartner,
                };
                delete payload._parent_name; delete payload._isFlipped;
                if (!hasLinks || isReimb) payload.original_amount = finalAmount;

                await supabase.from("transactions").update(payload).eq("id", id);
            }
            setShowReviewModal(false);
            setRuleSuggestion(null);
            await fetchTransactions();
        } catch (err) { alert(err.message); }
        finally { setLoading(false); }
    };

    const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length;
    const hasPending = Object.keys(pendingChanges).length > 0;

    const filterInputCls = "bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all";

    return (
        <div className="max-w-[98%] mx-auto px-4 sm:px-6 pt-8 pb-16">
            {loading && (
                <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[200] flex items-center justify-center">
                    <div className="bg-white border border-gray-200 shadow-lg rounded-2xl px-6 py-3 flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                        <span className="text-sm font-medium text-gray-700">Processing…</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Transactions</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Edit, manage, and review all records</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowInsertModal(true)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                        + Add
                    </button>
                    {hasPending && (
                        <>
                            <button
                                onClick={() => { setPendingChanges({}); setSelectedIds(new Set()); }}
                                className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-2 transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={() => setShowReviewModal(true)}
                                className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-full transition-colors shadow-sm"
                            >
                                Save {Object.keys(pendingChanges).length} change{Object.keys(pendingChanges).length !== 1 ? 's' : ''}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Rule suggestion banner */}
            {ruleSuggestion && (
                <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-100 px-4 py-3 rounded-2xl text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-blue-400 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    <span className="text-blue-700 flex-1">
                        Always categorize <strong>{ruleSuggestion.merchant}</strong> as <strong>{ruleSuggestion.category}</strong>?
                    </span>
                    <button onClick={handleCreateRule} disabled={ruleCreating}
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0">
                        {ruleCreating ? "Creating…" : "Create rule"}
                    </button>
                    <button onClick={() => setRuleSuggestion(null)}
                        className="text-blue-400 hover:text-blue-600 text-xs font-medium shrink-0">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <input type="text" placeholder="Search merchant…" className={filterInputCls} value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
                    <select className={filterInputCls} value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
                        <option value="">All types</option>
                        {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <input type={filters.startDate ? "date" : "text"} placeholder="Start date" className={filterInputCls}
                            value={filters.startDate} onFocus={e => e.target.type = "date"}
                            onBlur={e => { if (!e.target.value) e.target.type = "text"; }}
                            onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} />
                        <input type={filters.endDate ? "date" : "text"} placeholder="End date" className={filterInputCls}
                            value={filters.endDate} onFocus={e => e.target.type = "date"}
                            onBlur={e => { if (!e.target.value) e.target.type = "text"; }}
                            onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} />
                    </div>
                    <div className="flex gap-2 items-center">
                        <input type="number" placeholder="Min $" className={filterInputCls} value={filters.minAmount} onChange={e => setFilters(p => ({ ...p, minAmount: e.target.value }))} />
                        <input type="number" placeholder="Max $" className={filterInputCls} value={filters.maxAmount} onChange={e => setFilters(p => ({ ...p, maxAmount: e.target.value }))} />
                        <button onClick={() => setFilters({ search: "", type: "", category: "", startDate: "", endDate: "", minAmount: "", maxAmount: "" })}
                            className="text-xs font-medium text-gray-400 hover:text-gray-700 shrink-0 transition-colors">
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-8">
                                    <input type="checkbox" checked={allSelected}
                                        ref={el => { if (el) el.indeterminate = someSelected; }}
                                        onChange={toggleSelectAll}
                                        className="h-3.5 w-3.5 cursor-pointer accent-blue-500" />
                                </th>
                                {["Date", "Merchant", "Type", "Category", "Total", "Self", "Partner", "Actions"].map(h => (
                                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {transactions.map(tx => {
                                const changes = pendingChanges[tx.id] || {};
                                const curCat = changes.category ?? tx.category;
                                const isSelected = selectedIds.has(tx.id);
                                const isDirty = Object.keys(changes).length > 0;
                                const originalRef = Math.abs(tx.original_amount ?? tx.amount ?? 0);
                                const totalReimb = getReimbursementTotal(tx.id);

                                const liveNet = curCat === "Reimbursement"
                                    ? Math.abs(changes.amount !== undefined ? changes.amount : tx.amount)
                                    : changes.amount !== undefined ? Math.abs(changes.amount) : Math.max(0, originalRef - totalReimb);

                                let displaySelf = Math.abs(changes.self_amount !== undefined ? changes.self_amount : (tx.self_amount ?? 0));
                                let displayPartner = Math.abs(changes.partner_amount !== undefined ? changes.partner_amount : (tx.partner_amount ?? 0));
                                if (Math.abs(liveNet - (displaySelf + displayPartner)) > 0.01) { displaySelf = liveNet; displayPartner = 0; }

                                const renderNumInput = (field, value, highlight = false) => (
                                    <input
                                        type="number"
                                        value={editingCell?.id === tx.id && editingCell?.field === field ? editingCell.value : value.toFixed(2)}
                                        className={`${inputCls} text-right font-mono w-20 ${highlight ? 'text-blue-500' : ''}`}
                                        onFocus={() => setEditingCell({ id: tx.id, field, value: value.toString() })}
                                        onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                        onBlur={() => {
                                            const n = parseFloat(editingCell?.value);
                                            if (!isNaN(n)) stageChange(tx.id, field, n);
                                            setEditingCell(null);
                                        }}
                                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                    />
                                );

                                return (
                                    <tr key={tx.id} className={`transition-colors ${isSelected ? 'bg-blue-50/60' : isDirty ? 'bg-amber-50/40' : 'hover:bg-gray-50/60'}`}>
                                        <td className="px-4 py-2.5">
                                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx.id)}
                                                className="h-3.5 w-3.5 cursor-pointer accent-blue-500" />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <input type="date" value={changes.date ?? tx.date} onChange={e => stageChange(tx.id, "date", e.target.value)} className={inputCls} />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                {tx._isFlipped && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Partner's transaction" />}
                                                <input type="text" value={changes.merchant ?? tx.merchant} onChange={e => stageChange(tx.id, "merchant", e.target.value)} className={`${inputCls} font-medium`} />
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <select value={changes.type ?? tx.type} onChange={e => stageChange(tx.id, "type", e.target.value)} className={`${inputCls} cursor-pointer`}>
                                                {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <select value={curCat} onChange={e => stageChange(tx.id, "category", e.target.value)} className={`${inputCls} cursor-pointer text-gray-500`}>
                                                {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="flex flex-col items-end">
                                                {renderNumInput("amount", liveNet, totalReimb > 0)}
                                                {totalReimb > 0 && curCat !== "Reimbursement" && (
                                                    <span className="text-[10px] text-gray-400">Base ${originalRef.toFixed(2)}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">{renderNumInput("self_amount", displaySelf)}</td>
                                        <td className="px-4 py-2.5 text-right">{renderNumInput("partner_amount", displayPartner)}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                {curCat === "Reimbursement" ? (
                                                    <button onClick={async () => {
                                                        setActiveChildId(tx.id); setShowParentModal(true);
                                                        const { data } = await supabase.from("transactions").select("id, date, merchant, amount, original_amount").eq("type", "Expense").neq("id", tx.id).order("date", { ascending: false }).limit(20);
                                                        setPotentialParents(data || []);
                                                    }} className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${(changes._parent_name || tx.parent?.merchant) ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}>
                                                        {changes._parent_name ?? tx.parent?.merchant ?? "Link parent"}
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button onClick={() => stageChange(tx.id, "self_amount", liveNet / 2)}
                                                            className="text-xs font-medium text-gray-400 hover:text-blue-500 transition-colors">
                                                            Split
                                                        </button>
                                                        {totalReimb > 0 && <span className="text-xs text-blue-500 font-medium">Linked</span>}
                                                    </>
                                                )}
                                                <button onClick={() => handleDelete(tx.id)}
                                                    className="ml-auto text-gray-300 hover:text-red-500 transition-colors p-0.5">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
                    <span className="text-sm font-medium text-gray-300">{selectedIds.size} selected</span>
                    <div className="w-px h-4 bg-white/20" />
                    <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                        className="bg-white/10 text-white text-sm rounded-lg px-3 py-1.5 outline-none border border-white/20 cursor-pointer">
                        <option value="">Recategorize as…</option>
                        {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={handleBulkRecategorize} disabled={!bulkCategory}
                        className="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
                        Apply
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white text-sm transition-colors">Clear</button>
                </div>
            )}

            {/* Insert modal */}
            {showInsertModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900">Add Transaction</h3>
                            <button onClick={() => { setShowInsertModal(false); setInsertForm(emptyForm); }}
                                className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {(() => {
                                const ins = "w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all";
                                return (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date</label>
                                                <input type="date" value={insertForm.date} onChange={e => handleInsertField("date", e.target.value)} className={ins} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Merchant</label>
                                                <input type="text" placeholder="e.g. Whole Foods" value={insertForm.merchant} onChange={e => handleInsertField("merchant", e.target.value)} className={ins} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Type</label>
                                                <select value={insertForm.type} onChange={e => handleInsertField("type", e.target.value)} className={ins}>
                                                    {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Category</label>
                                                <select value={insertForm.category} onChange={e => handleInsertField("category", e.target.value)} className={ins}>
                                                    {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[["Total", "amount", "0.00"], ["My share", "self_amount", "0.00"], ["Partner share", "partner_amount", "0.00"]].map(([label, field, ph]) => (
                                                <div key={field}>
                                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
                                                    <input type="number" placeholder={ph} min="0" step="0.01" value={insertForm[field]} onChange={e => handleInsertField(field, e.target.value)} className={ins} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 items-end">
                                            <div className="col-span-2">
                                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                                                <input type="text" placeholder="Description…" value={insertForm.description} onChange={e => handleInsertField("description", e.target.value)} className={ins} />
                                            </div>
                                            <div className="flex items-center gap-2 pb-1">
                                                <input type="checkbox" id="ins-ex" checked={insertForm.exclude_from_report} onChange={e => handleInsertField("exclude_from_report", e.target.checked)} className="h-4 w-4 accent-blue-500 cursor-pointer" />
                                                <label htmlFor="ins-ex" className="text-xs font-medium text-gray-500 cursor-pointer">Exclude from reports</label>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => { setShowInsertModal(false); setInsertForm(emptyForm); }}
                                className="text-sm font-medium text-gray-500 hover:text-gray-900 px-4 py-2 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleInsertSubmit} disabled={inserting || !insertForm.merchant.trim() || !insertForm.amount}
                                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-medium px-6 py-2 rounded-full transition-colors">
                                {inserting ? "Adding…" : "Add Transaction"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Review modal */}
            {showReviewModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-900">Review Changes</h3>
                            <span className="text-xs text-gray-400 font-medium">Total = Self + Partner</span>
                        </div>
                        <div className="p-6 max-h-96 overflow-y-auto space-y-3">
                            {Object.entries(pendingChanges).map(([id, updates]) => {
                                const tx = transactions.find(t => t.id === id);
                                const isReimb = (updates.category ?? tx?.category) === "Reimbursement";
                                const base = updates.original_amount ?? tx?.original_amount ?? tx?.amount;
                                const net = isReimb ? (updates.amount ?? tx.amount) : Math.max(0, base - getReimbursementTotal(id));
                                let dSelf = updates.self_amount ?? tx?.self_amount;
                                let dPartner = updates.partner_amount ?? tx?.partner_amount;
                                if (Math.abs(net - (dSelf + dPartner)) > 0.01) { dSelf = net; dPartner = 0; }

                                return (
                                    <div key={id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm">
                                        <p className="font-semibold text-blue-500 mb-2">{tx?.merchant}</p>
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2 bg-white p-2 rounded-lg border border-gray-100">
                                            <div className="text-gray-500">Net <span className="font-semibold text-gray-900">${net.toFixed(2)}</span></div>
                                            <div className="text-gray-500">Self <span className="font-semibold text-blue-500">${dSelf.toFixed(2)}</span></div>
                                            <div className="text-gray-500">Partner <span className="font-semibold text-emerald-500">${dPartner.toFixed(2)}</span></div>
                                        </div>
                                        <div className="space-y-1">
                                            {Object.entries(updates).map(([f, v]) =>
                                                !f.startsWith('_') && !["amount","self_amount","partner_amount"].includes(f) && (
                                                    <div key={f} className="flex justify-between text-xs py-0.5 border-t border-gray-100">
                                                        <span className="text-gray-400 capitalize">{f.replace('_', ' ')}</span>
                                                        <span className="font-medium text-emerald-600">{String(v)}</span>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setShowReviewModal(false)} className="text-sm font-medium text-gray-500 hover:text-gray-900 px-4 py-2 transition-colors">Back</button>
                            <button onClick={handleConfirmSave} className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-6 py-2 rounded-full transition-colors">Confirm & save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Parent modal */}
            {showParentModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Link to expense</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {potentialParents.map(p => (
                                <button key={p.id} onClick={() => {
                                    stageChange(activeChildId, "parent_id", p.id);
                                    stageChange(activeChildId, "_parent_name", p.merchant);
                                    setShowParentModal(false);
                                }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-center transition-colors group">
                                    <div>
                                        <p className="font-medium text-gray-800 group-hover:text-blue-500 transition-colors">{p.merchant}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{p.date}</p>
                                    </div>
                                    <span className="font-semibold text-red-500 text-sm">${Math.abs(p.original_amount ?? p.amount).toFixed(2)}</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowParentModal(false)} className="mt-4 w-full py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-600 transition-colors">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
