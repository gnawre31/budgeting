import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { createCategorizationRule } from "../services/transactionService";
import { useCategories } from "../hooks/useCategories";

const TYPE_OPTIONS = ["Income", "Expense"];
// Note: alwaysExcludedCategories comes from useCategories() hook below

const inputCls = "w-full bg-transparent outline-none py-1 px-1.5 rounded-md text-sm transition-colors focus:bg-gray-100";

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pendingChanges, setPendingChanges] = useState({});
    const [editingCell, setEditingCell] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showParentModal, setShowParentModal] = useState(false);
    const [parentsLoading, setParentsLoading] = useState(false);
    const [activeChildId, setActiveChildId] = useState(null);
    const [potentialParents, setPotentialParents] = useState([]);
    const [expandedNotes, setExpandedNotes] = useState(new Set());

    const { expenseCategories, incomeCategories, alwaysExcludedCategories } = useCategories();
    const categoryOptions = (type) => type === "Income" ? incomeCategories : expenseCategories;
    const allCategoryOptions = [...new Set([...expenseCategories, ...incomeCategories])];

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkCategory, setBulkCategory] = useState("");
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

    const [ruleSuggestion, setRuleSuggestion] = useState(null);
    const [ruleCreating, setRuleCreating] = useState(false);

    const [filters, setFilters] = useState({ search: "", type: "", category: "", startDate: "", endDate: "", minAmount: "", maxAmount: "" });

    const [showInsertModal, setShowInsertModal] = useState(false);
    const today = new Date().toISOString().split('T')[0];
    const emptyForm = { date: today, merchant: "", type: "Expense", category: "Other", amount: "", self_amount: "", partner_amount: "", exclude_from_report: false, description: "" };
    const [insertForm, setInsertForm] = useState(emptyForm);
    const [inserting, setInserting] = useState(false);
    const [insertError, setInsertError] = useState(null);
    const [saveError, setSaveError] = useState(null);

    const toggleNotes = (id) => setExpandedNotes(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

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
        setExpandedNotes(new Set());
        setLoading(false);
    }, [filters]);

    const debounceRef = useRef(null);
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchTransactions(), 300);
        return () => clearTimeout(debounceRef.current);
    }, [fetchTransactions]);

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
        allSelected ? new Set() : new Set(selectableTransactions.map(t => t.id))
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
            // Delete any partner-credit children first, then the parent
            await supabase.from("transactions").delete().eq("parent_id", id).eq("is_partner_credit", true);
            const { error } = await supabase.from("transactions").delete().eq("id", id);
            if (error) throw error;
            await fetchTransactions();
        } catch (err) { alert(err.message); setLoading(false); }
    };

    // Only own (non-flipped) transactions can be deleted — RLS blocks deleting partner rows
    const deletableIds = Array.from(selectedIds).filter(id => {
        const tx = transactions.find(t => t.id === id);
        return tx && !tx._isFlipped;
    });
    const partnerSelectedCount = selectedIds.size - deletableIds.length;

    const handleBulkDelete = async () => {
        setShowBulkDeleteModal(false);
        if (deletableIds.length === 0) return;
        setLoading(true);
        try {
            // Delete any partner-credit children first, then the parents
            await supabase.from("transactions").delete().in("parent_id", deletableIds).eq("is_partner_credit", true);
            const { error } = await supabase.from("transactions").delete().in("id", deletableIds);
            if (error) throw error;
            await fetchTransactions();
        } catch (err) { alert(err.message); setLoading(false); }
    };

    const handleInsertField = (field, value) => {
        setInsertError(null);
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
        const amount = Math.abs(parseFloat(insertForm.amount));
        const selfAmt = insertForm.self_amount !== "" ? parseFloat(insertForm.self_amount) : amount;
        const partnerAmt = insertForm.partner_amount !== "" ? parseFloat(insertForm.partner_amount) : 0;
        if (Math.abs(selfAmt + partnerAmt - amount) > 0.01) {
            setInsertError(`Self (${selfAmt.toFixed(2)}) + Partner (${partnerAmt.toFixed(2)}) must equal Total (${amount.toFixed(2)})`);
            return;
        }
        setInserting(true);
        setInsertError(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from("users").select("partner_id").eq("id", user.id).maybeSingle();
            const { error } = await supabase.from("transactions").insert({
                user_id: user.id,
                partner_id: profile?.partner_id ?? null,
                date: insertForm.date,
                merchant: insertForm.merchant.trim(),
                merchant_normalized: insertForm.merchant.trim().toLowerCase(),
                type: insertForm.type,
                category: insertForm.category,
                amount,
                self_amount: selfAmt,
                partner_amount: partnerAmt,
                original_amount: amount,
                exclude_from_report: insertForm.exclude_from_report,
                description: insertForm.description || null,
            });
            if (error) throw error;
            setShowInsertModal(false);
            setInsertForm(emptyForm);
            await fetchTransactions();
        } catch (err) { setInsertError(err.message); }
        finally { setInserting(false); }
    };

    const handleConfirmSave = async () => {
        setLoading(true);
        setSaveError(null);
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

                const { error } = await supabase.from("transactions").update(payload).eq("id", id);
                if (error) throw error;
            }
            setShowReviewModal(false);
            setRuleSuggestion(null);
            await fetchTransactions();
        } catch (err) {
            setSaveError(err.message);
        } finally { setLoading(false); }
    };

    const selectableTransactions = transactions.filter(t => !t.is_partner_credit);
    const allSelected = selectableTransactions.length > 0 && selectedIds.size === selectableTransactions.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < selectableTransactions.length;
    const hasPending = Object.keys(pendingChanges).length > 0;

    // h-9 ensures select and input elements are the same height across browsers
    const filterInputCls = "h-9 bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all";
    const modalInputCls = "w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all";

    const deriveTx = (tx) => {
        const changes = pendingChanges[tx.id] || {};
        const curCat = changes.category ?? tx.category;
        const curType = changes.type ?? tx.type;
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
        const curDescription = changes.description !== undefined ? changes.description : (tx.description || "");
        const hasNotes = curDescription.trim().length > 0;
        const isMandatoryExclude = alwaysExcludedCategories.includes(curCat);
        const isExcluded = isMandatoryExclude || (changes.exclude_from_report !== undefined ? changes.exclude_from_report : (tx.exclude_from_report || false));
        const isPartnerCredit = tx.is_partner_credit === true;
        return { changes, curCat, curType, isSelected, isDirty, originalRef, totalReimb, liveNet, displaySelf, displayPartner, curDescription, hasNotes, isExcluded, isMandatoryExclude, isPartnerCredit };
    };

    const openParentModal = async (txId) => {
        setActiveChildId(txId);
        setPotentialParents([]);
        setParentsLoading(true);
        setShowParentModal(true);
        const { data } = await supabase.from("transactions").select("id, date, merchant, amount, original_amount").eq("type", "Expense").neq("id", txId).order("date", { ascending: false }).limit(20);
        setPotentialParents(data || []);
        setParentsLoading(false);
    };

    const renderNumInput = (tx, field, value, highlight = false) => (
        <input
            type="number"
            value={editingCell?.id === tx.id && editingCell?.field === field ? editingCell.value : value.toFixed(2)}
            className={`${inputCls} text-right font-mono w-full ${highlight ? 'text-blue-500' : ''}`}
            onFocus={() => setEditingCell({ id: tx.id, field, value: value.toString() })}
            onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
            onBlur={() => {
                const n = parseFloat(editingCell?.value);
                if (!isNaN(n)) stageChange(tx.id, field, n);
                setEditingCell(null);
            }}
            onKeyDown={e => {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') { setEditingCell(null); e.target.blur(); }
            }}
        />
    );

    const NotesPencilIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
        </svg>
    );

    return (
        <div className="max-w-[98%] mx-auto px-3 sm:px-6 pt-6 sm:pt-8 pb-24">
            {loading && (
                <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[200] flex items-center justify-center">
                    <div className="bg-white border border-gray-200 shadow-lg rounded-2xl px-6 py-3 flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                        <span className="text-sm font-medium text-gray-700">Processing…</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Transactions</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Edit, manage, and review all records</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setShowInsertModal(true)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                        + Add
                    </button>
                    {hasPending && (
                        <>
                            <button
                                onClick={() => {
                                    if (window.confirm(`Discard ${Object.keys(pendingChanges).length} unsaved change${Object.keys(pendingChanges).length !== 1 ? 's' : ''}?`)) {
                                        setPendingChanges({});
                                        setSelectedIds(new Set());
                                    }
                                }}
                                className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-2 transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                onClick={() => { setSaveError(null); setShowReviewModal(true); }}
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
                <div className="flex flex-wrap gap-2 items-center">
                    <input type="text" placeholder="Search merchant…"
                        className={`${filterInputCls} flex-[2_1_160px] min-w-0`}
                        value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
                    <select className={`${filterInputCls} flex-[1_1_120px] min-w-0`}
                        value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
                        <option value="">All types</option>
                        {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <input type={filters.startDate ? "date" : "text"} placeholder="Start date"
                        className={`${filterInputCls} flex-[1_1_130px] min-w-0`}
                        value={filters.startDate} onFocus={e => e.target.type = "date"}
                        onBlur={e => { if (!e.target.value) e.target.type = "text"; }}
                        onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} />
                    <input type={filters.endDate ? "date" : "text"} placeholder="End date"
                        className={`${filterInputCls} flex-[1_1_130px] min-w-0`}
                        value={filters.endDate} onFocus={e => e.target.type = "date"}
                        onBlur={e => { if (!e.target.value) e.target.type = "text"; }}
                        onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} />
                    <input type="number" placeholder="Min $"
                        className={`${filterInputCls} flex-[1_1_80px] min-w-0`}
                        value={filters.minAmount} onChange={e => setFilters(p => ({ ...p, minAmount: e.target.value }))} />
                    <input type="number" placeholder="Max $"
                        className={`${filterInputCls} flex-[1_1_80px] min-w-0`}
                        value={filters.maxAmount} onChange={e => setFilters(p => ({ ...p, maxAmount: e.target.value }))} />
                    <button onClick={() => setFilters({ search: "", type: "", category: "", startDate: "", endDate: "", minAmount: "", maxAmount: "" })}
                        className="text-xs font-medium text-gray-400 hover:text-gray-700 shrink-0 transition-colors px-1">
                        Reset
                    </button>
                </div>
            </div>

            {/* ─── Mobile card list (hidden on md+) ─── */}
            <div className="md:hidden space-y-2">
                {transactions.length === 0 && !loading ? (
                    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-4 py-16 text-center text-sm text-gray-400">
                        No transactions found.{" "}
                        <button onClick={() => setShowInsertModal(true)} className="text-blue-500 hover:underline">Add one manually</button>.
                    </div>
                ) : transactions.map(tx => {
                    const { changes, curCat, curType, isSelected, isDirty, originalRef, totalReimb, liveNet, displaySelf, displayPartner, curDescription, hasNotes, isExcluded, isMandatoryExclude, isPartnerCredit } = deriveTx(tx);
                    const fmt = (n) => `$${n.toFixed(2)}`;
                    const notesOpen = expandedNotes.has(tx.id);

                    // Partner-credit rows — compact read-only card on mobile
                    if (isPartnerCredit) {
                        return (
                            <div key={tx.id} className="bg-teal-50/60 border border-teal-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-teal-400 text-sm shrink-0">↩</span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-teal-700 truncate">{tx.merchant}</p>
                                        <p className="text-xs text-teal-400 mt-0.5">{tx.date} · {tx.category}</p>
                                    </div>
                                </div>
                                <span className="text-sm font-semibold text-teal-600 tabular-nums shrink-0">
                                    {new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(tx.amount)}
                                </span>
                            </div>
                        );
                    }

                    return (
                        <div key={tx.id}
                            className={`bg-white rounded-2xl border shadow-sm px-4 py-3.5 transition-colors ${isSelected ? 'border-blue-200 bg-blue-50/40' : isDirty ? 'border-slate-200 bg-slate-50/40' : 'border-gray-200/60'}`}>
                            {/* Top row: checkbox + merchant + amount */}
                            <div className="flex items-start gap-2.5">
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx.id)}
                                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-blue-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        {tx._isFlipped && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" title="Partner's transaction" />}
                                        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Unsaved changes" />}
                                        <input
                                            type="text"
                                            value={changes.merchant ?? tx.merchant}
                                            onChange={e => stageChange(tx.id, "merchant", e.target.value)}
                                            className="font-semibold text-gray-900 text-sm bg-transparent outline-none w-full truncate focus:bg-gray-100 rounded px-1 py-0.5 -mx-1"
                                        />
                                        <button
                                            onClick={() => toggleNotes(tx.id)}
                                            title={notesOpen ? "Hide note" : hasNotes ? "Edit note" : "Add note"}
                                            className={`shrink-0 p-1 rounded-md transition-colors ${notesOpen || hasNotes ? 'text-blue-400 bg-blue-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            <NotesPencilIcon />
                                        </button>
                                    </div>
                                    {/* Notes preview */}
                                    {hasNotes && !notesOpen && (
                                        <p onClick={() => toggleNotes(tx.id)} className="text-[11px] text-gray-400 truncate mt-0.5 px-1 cursor-pointer hover:text-gray-600 transition-colors">
                                            {curDescription}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                        <input type="date" value={changes.date ?? tx.date}
                                            onChange={e => stageChange(tx.id, "date", e.target.value)}
                                            className="text-xs text-gray-400 bg-transparent outline-none focus:bg-gray-100 rounded px-1 py-0.5 -mx-1" />
                                        <span className="text-gray-200">·</span>
                                        {/* Income/Expense pill toggle */}
                                        <div className="flex rounded-md overflow-hidden border border-gray-200">
                                            {TYPE_OPTIONS.map((type) => (
                                                <button key={type}
                                                    onClick={() => { if (curType !== type) stageChange(tx.id, "type", type); }}
                                                    className={`text-[11px] font-medium px-1.5 py-0.5 transition-colors ${curType === type ? (type === "Income" ? "bg-green-500 text-white" : "bg-rose-500 text-white") : "bg-white text-gray-400 hover:bg-gray-50"}`}>
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                        <span className="text-gray-200">·</span>
                                        <select value={curCat}
                                            onChange={e => stageChange(tx.id, "category", e.target.value)}
                                            className="text-xs text-gray-500 bg-transparent outline-none focus:bg-gray-100 rounded px-1 py-0.5 -mx-1 cursor-pointer max-w-[130px]">
                                            {categoryOptions(curType).map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`text-base font-semibold tabular-nums ${totalReimb > 0 ? 'text-blue-500' : 'text-gray-900'}`}>{fmt(liveNet)}</p>
                                    {totalReimb > 0 && curCat !== "Reimbursement" && (
                                        <p className="text-[10px] text-gray-400">Base {fmt(originalRef)}</p>
                                    )}
                                </div>
                            </div>

                            {/* Expandable notes */}
                            {notesOpen && (
                                <div className="mt-2.5 flex items-center gap-2 bg-blue-50/60 rounded-xl px-3 py-2">
                                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider shrink-0">Note</span>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={curDescription}
                                        onChange={e => stageChange(tx.id, "description", e.target.value)}
                                        placeholder="Add a note…"
                                        className="flex-1 text-sm text-gray-700 bg-white border border-blue-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-300 placeholder:text-gray-300 transition-all"
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') toggleNotes(tx.id); }}
                                    />
                                    <button onClick={() => toggleNotes(tx.id)} className="text-xs text-blue-400 hover:text-blue-600 shrink-0">Done</button>
                                </div>
                            )}

                            {/* Split row */}
                            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Self</label>
                                    <input
                                        type="number"
                                        value={editingCell?.id === tx.id && editingCell?.field === "self_amount" ? editingCell.value : displaySelf.toFixed(2)}
                                        className="w-full text-sm font-mono text-indigo-500 bg-gray-50 rounded-lg px-2.5 py-1.5 outline-none border border-transparent focus:bg-white focus:border-gray-200"
                                        onFocus={() => setEditingCell({ id: tx.id, field: "self_amount", value: displaySelf.toString() })}
                                        onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                        onBlur={() => { const n = parseFloat(editingCell?.value); if (!isNaN(n)) stageChange(tx.id, "self_amount", n); setEditingCell(null); }}
                                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditingCell(null); e.target.blur(); } }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Partner</label>
                                    <input
                                        type="number"
                                        value={editingCell?.id === tx.id && editingCell?.field === "partner_amount" ? editingCell.value : displayPartner.toFixed(2)}
                                        className="w-full text-sm font-mono text-teal-500 bg-gray-50 rounded-lg px-2.5 py-1.5 outline-none border border-transparent focus:bg-white focus:border-gray-200"
                                        onFocus={() => setEditingCell({ id: tx.id, field: "partner_amount", value: displayPartner.toString() })}
                                        onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
                                        onBlur={() => { const n = parseFloat(editingCell?.value); if (!isNaN(n)) stageChange(tx.id, "partner_amount", n); setEditingCell(null); }}
                                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditingCell(null); e.target.blur(); } }}
                                    />
                                </div>
                            </div>

                            {/* Actions row */}
                            <div className="mt-2.5 flex items-center gap-1.5">
                                {curCat === "Reimbursement" ? (
                                    <button onClick={() => openParentModal(tx.id)}
                                        className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${(changes._parent_name || tx.parent?.merchant) ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}>
                                        {changes._parent_name ?? tx.parent?.merchant ?? "Link parent"}
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={() => stageChange(tx.id, "self_amount", liveNet / 2)}
                                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors">
                                            Split 50/50
                                        </button>
                                        {totalReimb > 0 && <span className="text-xs text-blue-500 font-medium px-1">Linked</span>}
                                    </>
                                )}
                                {/* Exclude toggle */}
                                <button
                                    onClick={() => !isMandatoryExclude && stageChange(tx.id, "exclude_from_report", !isExcluded)}
                                    title={isMandatoryExclude ? "Always excluded from reports" : isExcluded ? "Include in reports" : "Exclude from reports"}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                        isMandatoryExclude
                                            ? "text-blue-400 bg-blue-50 cursor-default"
                                            : isExcluded
                                                ? "text-gray-500 bg-gray-200 hover:bg-gray-300"
                                                : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                                    }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                    </svg>
                                </button>
                                {/* Delete */}
                                <button onClick={() => handleDelete(tx.id)}
                                    className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors ml-auto">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ─── Desktop table (hidden below md) ─── */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-3 w-10">
                                    <input type="checkbox" checked={allSelected}
                                        ref={el => { if (el) el.indeterminate = someSelected; }}
                                        onChange={toggleSelectAll}
                                        className="h-3.5 w-3.5 cursor-pointer accent-blue-500" />
                                </th>
                                <th className="px-4 py-3 w-36 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 min-w-[160px] text-xs font-semibold text-gray-500 uppercase tracking-wider">Merchant</th>
                                <th className="px-4 py-3 w-36 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 w-40 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                <th className="px-4 py-3 w-36 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total</th>
                                <th className="px-4 py-3 w-36 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Self</th>
                                <th className="px-4 py-3 w-36 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Partner</th>
                                <th className="px-4 py-3 w-44 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-gray-400">
                                        No transactions found. Try adjusting your filters or{" "}
                                        <button onClick={() => setShowInsertModal(true)} className="text-blue-500 hover:underline">add one manually</button>.
                                    </td>
                                </tr>
                            ) : transactions.map(tx => {
                                const { changes, curCat, curType, isSelected, isDirty, originalRef, totalReimb, liveNet, displaySelf, displayPartner, curDescription, hasNotes, isExcluded, isMandatoryExclude, isPartnerCredit } = deriveTx(tx);
                                const notesOpen = expandedNotes.has(tx.id);

                                // Partner-credit rows get a simplified read-only display
                                if (isPartnerCredit) {
                                    return (
                                        <tr key={tx.id} className="border-b border-teal-50 bg-teal-50/40">
                                            <td className="px-4 py-2.5" />
                                            <td className="px-4 py-2.5 text-xs text-teal-600">{tx.date}</td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-teal-400 shrink-0" title="Auto-created partner credit">↩</span>
                                                    <span className="text-sm font-medium text-teal-700">{tx.merchant}</span>
                                                </div>
                                                {tx.description && (
                                                    <p className="text-[11px] text-teal-400 mt-0.5 pl-4">{tx.description}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-100 text-teal-600">Credit</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-teal-600">{tx.category}</td>
                                            <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-teal-600">
                                                {new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(tx.amount)}
                                            </td>
                                            <td colSpan={3} className="px-4 py-2.5 text-xs text-teal-400 text-center">
                                                Manage in Reconcile
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <React.Fragment key={tx.id}>
                                        <tr
                                            className={`border-b ${notesOpen ? 'border-gray-50' : 'border-gray-100'} transition-colors ${isSelected ? 'bg-blue-50/60' : isDirty ? 'bg-slate-50/60' : 'hover:bg-gray-50/60'}`}
                                            style={isExcluded ? { opacity: 0.4 } : undefined}
                                        >
                                            <td className="px-4 py-2.5">
                                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx.id)}
                                                    className="h-3.5 w-3.5 cursor-pointer accent-blue-500" />
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <input type="date" value={changes.date ?? tx.date} onChange={e => stageChange(tx.id, "date", e.target.value)} className={inputCls} />
                                            </td>
                                            {/* Merchant + notes */}
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    {tx._isFlipped && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" title="Partner's transaction" />}
                                                    <div className="flex-1 min-w-0">
                                                        <input type="text" value={changes.merchant ?? tx.merchant} onChange={e => stageChange(tx.id, "merchant", e.target.value)} className={`${inputCls} font-medium`} />
                                                        {hasNotes && !notesOpen && (
                                                            <p onClick={() => toggleNotes(tx.id)}
                                                                className="text-[11px] text-gray-400 truncate mt-0.5 px-1.5 cursor-pointer hover:text-gray-600 transition-colors"
                                                                title={curDescription}>
                                                                {curDescription}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => toggleNotes(tx.id)}
                                                        title={notesOpen ? "Hide note" : hasNotes ? "Edit note" : "Add note"}
                                                        className={`shrink-0 p-1 rounded-md transition-colors ${notesOpen || hasNotes ? 'text-blue-400 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                                    >
                                                        <NotesPencilIcon />
                                                    </button>
                                                </div>
                                            </td>
                                            {/* Type — Income/Expense pill toggle */}
                                            <td className="px-4 py-2.5">
                                                <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit">
                                                    {TYPE_OPTIONS.map((type) => (
                                                        <button key={type}
                                                            onClick={() => { if (curType !== type) stageChange(tx.id, "type", type); }}
                                                            className={`text-xs font-medium px-2.5 py-1 transition-colors whitespace-nowrap ${curType === type ? (type === "Income" ? "bg-green-500 text-white" : "bg-rose-500 text-white") : "bg-white text-gray-400 hover:bg-gray-50"}`}>
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <select value={curCat} onChange={e => stageChange(tx.id, "category", e.target.value)} className={`${inputCls} cursor-pointer text-gray-500`}>
                                                    {categoryOptions(curType).map(c => <option key={c}>{c}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <div className="flex flex-col items-end">
                                                    {renderNumInput(tx, "amount", liveNet, totalReimb > 0)}
                                                    {totalReimb > 0 && curCat !== "Reimbursement" && (
                                                        <span className="text-[10px] text-gray-400">Base ${originalRef.toFixed(2)}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">{renderNumInput(tx, "self_amount", displaySelf)}</td>
                                            <td className="px-4 py-2.5 text-right">{renderNumInput(tx, "partner_amount", displayPartner)}</td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center justify-center gap-1">
                                                    {curCat === "Reimbursement" ? (
                                                        <button onClick={() => openParentModal(tx.id)}
                                                            className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${(changes._parent_name || tx.parent?.merchant) ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}>
                                                            {changes._parent_name ?? tx.parent?.merchant ?? "Link parent"}
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => stageChange(tx.id, "self_amount", liveNet / 2)}
                                                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors">
                                                                Split
                                                            </button>
                                                            {totalReimb > 0 && <span className="text-xs text-blue-500 font-medium px-1">Linked</span>}
                                                        </>
                                                    )}
                                                    {/* Exclude toggle */}
                                                    <button
                                                        onClick={() => !isMandatoryExclude && stageChange(tx.id, "exclude_from_report", !isExcluded)}
                                                        title={isMandatoryExclude ? "Always excluded from reports" : isExcluded ? "Include in reports" : "Exclude from reports"}
                                                        className={`p-1.5 rounded-lg transition-colors ${
                                                            isMandatoryExclude
                                                                ? "text-blue-400 bg-blue-50 cursor-default"
                                                                : isExcluded
                                                                    ? "text-gray-500 bg-gray-200 hover:bg-gray-300"
                                                                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                                                        }`}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                                        </svg>
                                                    </button>
                                                    {/* Delete */}
                                                    <button onClick={() => handleDelete(tx.id)}
                                                        className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="Delete transaction">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Expandable notes row */}
                                        {notesOpen && (
                                            <tr className="border-b border-gray-100 bg-blue-50/30" style={isExcluded ? { opacity: 0.4 } : undefined}>
                                                <td colSpan={2} />
                                                <td colSpan={7} className="px-4 pb-2.5 pt-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider shrink-0">Note</span>
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            value={curDescription}
                                                            onChange={e => stageChange(tx.id, "description", e.target.value)}
                                                            placeholder="Add a note for this transaction…"
                                                            className="flex-1 text-sm text-gray-700 bg-white border border-blue-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 placeholder:text-gray-300 transition-all"
                                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') toggleNotes(tx.id); }}
                                                        />
                                                        <button onClick={() => toggleNotes(tx.id)} className="text-xs text-blue-400 hover:text-blue-600 shrink-0 transition-colors">Done</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 sm:px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 sm:gap-3 border border-white/10 max-w-[calc(100vw-2rem)] w-max">
                    <span className="text-sm font-medium text-gray-300 shrink-0">{selectedIds.size} selected</span>
                    <div className="w-px h-4 bg-white/20 shrink-0" />
                    <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                        className="bg-white/10 text-white text-sm rounded-lg px-2 sm:px-3 py-1.5 outline-none border border-white/20 cursor-pointer min-w-0">
                        <option value="">Recategorize…</option>
                        {allCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={handleBulkRecategorize} disabled={!bulkCategory}
                        className="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white text-sm font-medium px-3 sm:px-4 py-1.5 rounded-lg transition-colors shrink-0">
                        Apply
                    </button>
                    <div className="w-px h-4 bg-white/20 shrink-0" />
                    <button
                        onClick={() => setShowBulkDeleteModal(true)}
                        className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        Delete
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white text-sm transition-colors shrink-0">Clear</button>
                </div>
            )}

            {/* Insert modal */}
            {showInsertModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-semibold text-gray-900">Add Transaction</h3>
                            <button onClick={() => { setShowInsertModal(false); setInsertForm(emptyForm); setInsertError(null); }}
                                className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            {insertError && (
                                <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600">{insertError}</div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date</label>
                                    <input type="date" value={insertForm.date} onChange={e => handleInsertField("date", e.target.value)} className={modalInputCls} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Merchant</label>
                                    <input type="text" placeholder="e.g. Whole Foods" value={insertForm.merchant} onChange={e => handleInsertField("merchant", e.target.value)} className={modalInputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Type</label>
                                    <select value={insertForm.type} onChange={e => handleInsertField("type", e.target.value)} className={modalInputCls}>
                                        {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Category</label>
                                    <select value={insertForm.category} onChange={e => handleInsertField("category", e.target.value)} className={modalInputCls}>
                                        {categoryOptions(insertForm.type).map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {[["Total", "amount", "0.00"], ["My share", "self_amount", "0.00"], ["Partner share", "partner_amount", "0.00"]].map(([label, field, ph]) => (
                                    <div key={field}>
                                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
                                        <input type="number" placeholder={ph} min="0" step="0.01" value={insertForm[field]} onChange={e => handleInsertField(field, e.target.value)} className={modalInputCls} />
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                                    <input type="text" placeholder="Description…" value={insertForm.description} onChange={e => handleInsertField("description", e.target.value)} className={modalInputCls} />
                                </div>
                                <div className="flex items-center gap-2 pb-1">
                                    <input type="checkbox" id="ins-ex" checked={insertForm.exclude_from_report} onChange={e => handleInsertField("exclude_from_report", e.target.checked)} className="h-4 w-4 accent-blue-500 cursor-pointer" />
                                    <label htmlFor="ins-ex" className="text-xs font-medium text-gray-500 cursor-pointer">Exclude from reports</label>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 shrink-0">
                            <button onClick={() => { setShowInsertModal(false); setInsertForm(emptyForm); setInsertError(null); }}
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
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-semibold text-gray-900">Review Changes</h3>
                            <span className="text-xs text-gray-400 font-medium">Total = Self + Partner</span>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-3">
                            {saveError && (
                                <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600">{saveError}</div>
                            )}
                            {Object.entries(pendingChanges).map(([id, updates]) => {
                                const tx = transactions.find(t => t.id === id);
                                const isReimb = (updates.category ?? tx?.category) === "Reimbursement";
                                const base = updates.original_amount ?? tx?.original_amount ?? tx?.amount;
                                const net = isReimb ? (updates.amount ?? tx.amount) : Math.max(0, base - getReimbursementTotal(id));
                                let dSelf = updates.self_amount ?? tx?.self_amount ?? 0;
                                let dPartner = updates.partner_amount ?? tx?.partner_amount ?? 0;
                                if (Math.abs(net - (dSelf + dPartner)) > 0.01) { dSelf = net; dPartner = 0; }

                                return (
                                    <div key={id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm">
                                        <p className="font-semibold text-blue-500 mb-2">{tx?.merchant}</p>
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2 bg-white p-2 rounded-lg border border-gray-100">
                                            <div className="text-gray-500">Net <span className="font-semibold text-gray-900">${net.toFixed(2)}</span></div>
                                            <div className="text-gray-500">Self <span className="font-semibold text-indigo-500">${dSelf.toFixed(2)}</span></div>
                                            <div className="text-gray-500">Partner <span className="font-semibold text-teal-500">${dPartner.toFixed(2)}</span></div>
                                        </div>
                                        <div className="space-y-1">
                                            {Object.entries(updates).map(([f, v]) =>
                                                !f.startsWith('_') && !["amount","self_amount","partner_amount"].includes(f) && (
                                                    <div key={f} className="flex justify-between text-xs py-0.5 border-t border-gray-100">
                                                        <span className="text-gray-400 capitalize">{f.replace('_', ' ')}</span>
                                                        <span className="font-medium text-green-600">{String(v)}</span>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 shrink-0">
                            <button onClick={() => setShowReviewModal(false)} className="text-sm font-medium text-gray-500 hover:text-gray-900 px-4 py-2 transition-colors">Back</button>
                            <button onClick={handleConfirmSave} className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-6 py-2 rounded-full transition-colors">Confirm & save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk delete confirmation modal */}
            {showBulkDeleteModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6 text-rose-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                Delete {deletableIds.length} transaction{deletableIds.length !== 1 ? 's' : ''}?
                            </h3>
                            <p className="text-sm text-gray-500">
                                This will permanently remove {deletableIds.length === 1 ? 'this transaction' : `all ${deletableIds.length} selected transactions`} from your records. This cannot be undone.
                            </p>
                            {partnerSelectedCount > 0 && (
                                <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    {partnerSelectedCount} partner-posted transaction{partnerSelectedCount !== 1 ? 's' : ''} will be skipped — only the partner who posted them can delete them.
                                </p>
                            )}
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setShowBulkDeleteModal(false)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 rounded-xl text-sm font-medium text-white transition-colors"
                            >
                                Delete {deletableIds.length === 1 ? 'transaction' : `${deletableIds.length} transactions`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Parent modal */}
            {showParentModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
                            <h3 className="text-lg font-semibold text-gray-900">Link to expense</h3>
                        </div>
                        <div className="p-4 space-y-2 overflow-y-auto">
                            {parentsLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                                </div>
                            ) : potentialParents.length === 0 ? (
                                <p className="text-center py-8 text-sm text-gray-400">No expenses found.</p>
                            ) : potentialParents.map(p => (
                                <button key={p.id} onClick={() => {
                                    stageChange(activeChildId, "parent_id", p.id);
                                    stageChange(activeChildId, "_parent_name", p.merchant);
                                    setShowParentModal(false);
                                }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-center transition-colors group">
                                    <div>
                                        <p className="font-medium text-gray-800 group-hover:text-blue-500 transition-colors">{p.merchant}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{p.date}</p>
                                    </div>
                                    <span className="font-semibold text-rose-500 text-sm">${Math.abs(p.original_amount ?? p.amount).toFixed(2)}</span>
                                </button>
                            ))}
                        </div>
                        <div className="p-4 border-t border-gray-100 shrink-0">
                            <button onClick={() => setShowParentModal(false)} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-600 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function NotesPencilIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
        </svg>
    );
}
