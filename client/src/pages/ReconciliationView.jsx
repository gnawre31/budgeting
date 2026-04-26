import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCategories } from "../hooks/useCategories";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMonth(dateStr) {
    const [y, m] = dateStr.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, 1)
        .toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function fmt(n) {
    return new Intl.NumberFormat("en-CA", {
        style: "currency", currency: "CAD", maximumFractionDigits: 2,
    }).format(n);
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ReimbursementItem({ tx, isSelected, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-5 py-3.5 transition-colors flex justify-between items-center ${
                isSelected ? "bg-indigo-50" : "hover:bg-gray-50/60"
            }`}
        >
            <div>
                <p className={`text-sm font-semibold ${isSelected ? "text-indigo-600" : "text-gray-900"}`}>
                    {tx.merchant}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{tx.date}</p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${isSelected ? "text-indigo-600" : "text-teal-500"}`}>
                {fmt(tx.amount)}
            </span>
        </button>
    );
}

function LinkedItem({ tx, onUnlink }) {
    const isCategoryLink = !tx.parent_id && tx.linked_category;
    return (
        <div className="px-5 py-3.5 flex justify-between items-center group hover:bg-gray-50/60 transition-colors">
            <div className="overflow-hidden flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">{tx.merchant}</span>
                    {isCategoryLink ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-600 whitespace-nowrap shrink-0">
                            ↩ {tx.linked_category}
                        </span>
                    ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-500 whitespace-nowrap shrink-0">
                            → {tx.parent?.merchant ?? "Expense"}
                        </span>
                    )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{tx.date} · {fmt(tx.amount)}</p>
            </div>
            <button
                onClick={() => onUnlink(tx)}
                className="text-xs font-medium text-rose-400 hover:text-rose-600 ml-4 opacity-0 group-hover:opacity-100 transition-all shrink-0"
            >
                Unlink
            </button>
        </div>
    );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ReconciliationView() {
    const { expenseCategories } = useCategories();

    const [reimbursements, setReimbursements] = useState([]);
    const [selectedChild, setSelectedChild] = useState(null);
    const [linkMode, setLinkMode] = useState("category"); // "category" | "transaction"
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const linkPanelRef = useRef(null);

    // Transaction-link panel state
    const [txSearch, setTxSearch] = useState("");
    const [txCategory, setTxCategory] = useState("");
    const [potentialParents, setPotentialParents] = useState([]);
    const [parentsLoading, setParentsLoading] = useState(false);

    // Category-link panel state
    const [selectedCategory, setSelectedCategory] = useState("");

    // ── data loading ──────────────────────────────────────────────────────────

    const loadReimbursements = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Try with embedded parent join first; fall back if PostgREST
        // hasn't cached the self-referential parent_id FK yet.
        let result = await supabase
            .from("transactions")
            .select("*, parent:parent_id(merchant)")
            .eq("category", "Reimbursement")
            .eq("user_id", user.id)
            .order("date", { ascending: false });

        if (result.error) {
            console.warn("loadReimbursements: join failed, retrying without it:", result.error.message);
            result = await supabase
                .from("transactions")
                .select("*")
                .eq("category", "Reimbursement")
                .eq("user_id", user.id)
                .order("date", { ascending: false });
        }

        if (result.error) {
            console.error("loadReimbursements error:", result.error);
            return;
        }

        setReimbursements((result.data || []).filter(tx => !tx.is_partner_credit));
    }, []);

    useEffect(() => { loadReimbursements(); }, [loadReimbursements]);

    const loadPotentialParents = useCallback(async () => {
        if (!selectedChild || linkMode !== "transaction") return;
        setParentsLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setParentsLoading(false); return; }

        let query = supabase
            .from("transactions")
            .select("*")
            .eq("type", "Expense")
            .is("parent_id", null)
            .neq("id", selectedChild.id)
            .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

        if (txSearch) query = query.ilike("merchant", `%${txSearch}%`);
        if (txCategory) query = query.eq("category", txCategory);

        const { data } = await query.order("date", { ascending: false }).limit(20);
        setPotentialParents((data || []).filter(t => !t.is_partner_credit));
        setParentsLoading(false);
    }, [selectedChild, linkMode, txSearch, txCategory]);

    useEffect(() => { loadPotentialParents(); }, [loadPotentialParents]);

    // ── select reimbursement ──────────────────────────────────────────────────

    const selectChild = (tx) => {
        setSelectedChild(tx);
        setError(null);
        setTxSearch("");
        setTxCategory("");
        setSelectedCategory("");
        // On mobile the link panel is below the list — scroll it into view
        if (tx) {
            setTimeout(() => {
                linkPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);
        }
    };

    // ── link to category ──────────────────────────────────────────────────────

    const handleLinkToCategory = async () => {
        if (!selectedChild || !selectedCategory) return;
        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { data: profile } = await supabase
                .from("users")
                .select("partner_id")
                .eq("id", user.id)
                .maybeSingle();

            const month = fmtMonth(selectedChild.date);
            const merchant = `↩ Partner credit – ${selectedCategory}`;

            // 1. Create the pseudo credit transaction
            const { error: insertErr } = await supabase.from("transactions").insert({
                date: selectedChild.date,
                merchant,
                merchant_normalized: merchant.toLowerCase(),
                description: `Partner contribution · ${month} — auto-created from reconciliation`,
                amount: -selectedChild.amount,
                original_amount: -selectedChild.amount,
                self_amount: -selectedChild.amount,
                partner_amount: 0,
                type: "Expense",
                category: selectedCategory,
                user_id: user.id,
                partner_id: profile?.partner_id ?? null,
                exclude_from_report: false,
                parent_id: selectedChild.id,
                is_partner_credit: true,
            });
            if (insertErr) throw insertErr;

            // 2. Mark the reimbursement as category-linked
            const { error: updateErr } = await supabase
                .from("transactions")
                .update({ linked_category: selectedCategory })
                .eq("id", selectedChild.id);
            if (updateErr) throw updateErr;

            setSelectedChild(null);
            setSelectedCategory("");
            await loadReimbursements();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── link to specific transaction ──────────────────────────────────────────

    const handleLinkToTransaction = async (parentId) => {
        if (!selectedChild) return;
        setLoading(true);
        setError(null);

        try {
            const { data: parent, error: fetchErr } = await supabase
                .from("transactions")
                .select("*")
                .eq("id", parentId)
                .single();
            if (fetchErr) throw fetchErr;

            if (selectedChild.amount > parent.amount) {
                throw new Error(`Reimbursement ($${selectedChild.amount.toFixed(2)}) exceeds expense ($${parent.amount.toFixed(2)}). Link to a larger expense.`);
            }

            const selfRatio = (parent.self_amount ?? 0) / (parent.amount || 1);
            const newTotal = Math.max(0, parent.amount - selectedChild.amount);
            const newSelf = Number((newTotal * selfRatio).toFixed(2));
            const newPartner = Number((newTotal - newSelf).toFixed(2));

            await supabase.from("transactions").update({ parent_id: parentId }).eq("id", selectedChild.id);
            await supabase.from("transactions").update({
                amount: newTotal,
                self_amount: newSelf,
                partner_amount: newPartner,
            }).eq("id", parentId);

            setSelectedChild(null);
            setTxSearch("");
            await loadReimbursements();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── unlink ────────────────────────────────────────────────────────────────

    const handleUnlink = async (tx) => {
        if (!window.confirm(`Unlink "${tx.merchant}"?`)) return;
        setError(null);

        try {
            if (tx.linked_category) {
                // Category-linked: delete pseudo credit + clear linked_category
                await supabase
                    .from("transactions")
                    .delete()
                    .eq("parent_id", tx.id)
                    .eq("is_partner_credit", true);

                await supabase
                    .from("transactions")
                    .update({ linked_category: null })
                    .eq("id", tx.id);
            } else if (tx.parent_id) {
                // Transaction-linked: restore parent amount
                const { data: parent } = await supabase
                    .from("transactions")
                    .select("*")
                    .eq("id", tx.parent_id)
                    .single();

                if (parent) {
                    const selfRatio = (parent.self_amount ?? 0) / (parent.amount || 1);
                    const restored = Number((parent.amount + tx.amount).toFixed(2));
                    const newSelf = Number((restored * selfRatio).toFixed(2));
                    const newPartner = Number((restored - newSelf).toFixed(2));

                    await supabase.from("transactions").update({
                        amount: restored,
                        self_amount: newSelf,
                        partner_amount: newPartner,
                    }).eq("id", tx.parent_id);
                }

                await supabase.from("transactions").update({ parent_id: null }).eq("id", tx.id);
            }

            await loadReimbursements();
        } catch (err) {
            setError(err.message);
        }
    };

    // ── derived ───────────────────────────────────────────────────────────────

    const unlinked = reimbursements.filter(r => !r.parent_id && !r.linked_category);
    const linked   = reimbursements.filter(r =>  r.parent_id ||  r.linked_category);

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Reconcile</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    Link reimbursements to a specific expense or a category to offset the cost automatically.
                </p>
            </div>

            {error && (
                <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-600">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="font-medium hover:text-rose-800 shrink-0">Dismiss</button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

                {/* ── LEFT: reimbursement list ── */}
                <div className="space-y-4">

                    {/* Needs linking */}
                    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Needs Linking</p>
                            {unlinked.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-xs font-semibold">
                                    {unlinked.length}
                                </span>
                            )}
                        </div>
                        <div className="divide-y divide-gray-100">
                            {unlinked.length === 0 ? (
                                <p className="px-5 py-10 text-center text-sm text-gray-400">
                                    All reimbursements are reconciled ✓
                                </p>
                            ) : unlinked.map(tx => (
                                <ReimbursementItem
                                    key={tx.id}
                                    tx={tx}
                                    isSelected={selectedChild?.id === tx.id}
                                    onClick={() => selectChild(selectedChild?.id === tx.id ? null : tx)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Linked */}
                    {linked.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reconciled</p>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {linked.map(tx => (
                                    <LinkedItem key={tx.id} tx={tx} onUnlink={handleUnlink} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: link panel ── */}
                <div ref={linkPanelRef} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden md:sticky md:top-24">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Link To</p>
                    </div>

                    {!selectedChild ? (
                        <div className="px-5 py-16 text-center text-gray-400">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                </svg>
                            </div>
                            <p className="text-sm font-medium text-gray-500">Select a reimbursement</p>
                            <p className="text-xs text-gray-400 mt-0.5">from the left to reconcile it</p>
                        </div>
                    ) : (
                        <div className="p-5 space-y-4">

                            {/* Selected pill */}
                            <div className="px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
                                <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-0.5">Reconciling</p>
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-sm font-semibold text-indigo-800">{selectedChild.merchant}</p>
                                    <span className="text-sm font-semibold text-indigo-600 tabular-nums shrink-0">{fmt(selectedChild.amount)}</span>
                                </div>
                                <p className="text-xs text-indigo-400 mt-0.5">{selectedChild.date} · {fmtMonth(selectedChild.date)}</p>
                            </div>

                            {/* Mode toggle */}
                            <div className="flex rounded-xl overflow-hidden border border-gray-200">
                                <button
                                    onClick={() => setLinkMode("category")}
                                    className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                                        linkMode === "category"
                                            ? "bg-gray-900 text-white"
                                            : "bg-white text-gray-400 hover:text-gray-600"
                                    }`}
                                >
                                    → Category
                                </button>
                                <button
                                    onClick={() => setLinkMode("transaction")}
                                    className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                                        linkMode === "transaction"
                                            ? "bg-gray-900 text-white"
                                            : "bg-white text-gray-400 hover:text-gray-600"
                                    }`}
                                >
                                    → Transaction
                                </button>
                            </div>

                            {/* ── Category mode ── */}
                            {linkMode === "category" && (
                                <div className="space-y-3">
                                    <p className="text-xs text-gray-500">
                                        Creates a <span className="font-semibold text-gray-700">-{fmt(selectedChild.amount)}</span> credit
                                        in the chosen expense category, automatically offsetting the cost in reports.
                                    </p>

                                    <select
                                        value={selectedCategory}
                                        onChange={e => setSelectedCategory(e.target.value)}
                                        className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none border border-transparent focus:bg-white focus:border-gray-300 transition-all"
                                    >
                                        <option value="">Choose a category…</option>
                                        {expenseCategories.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>

                                    {selectedCategory && (
                                        <div className="px-3 py-2.5 bg-teal-50 border border-teal-100 rounded-xl text-xs text-teal-700 space-y-0.5">
                                            <p className="font-semibold">Will create:</p>
                                            <p>↩ Partner credit – {selectedCategory}</p>
                                            <p className="text-teal-500">{fmt(-selectedChild.amount)} · {selectedChild.date} · {selectedCategory}</p>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleLinkToCategory}
                                        disabled={!selectedCategory || loading}
                                        className="w-full bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                                    >
                                        {loading ? "Creating…" : "Create credit"}
                                    </button>
                                </div>
                            )}

                            {/* ── Transaction mode ── */}
                            {linkMode === "transaction" && (
                                <div className="space-y-3">
                                    <p className="text-xs text-gray-500">
                                        Subtracts <span className="font-semibold text-gray-700">{fmt(selectedChild.amount)}</span> directly
                                        from a specific expense transaction's amount.
                                    </p>

                                    <input
                                        type="text"
                                        placeholder="Search merchant…"
                                        value={txSearch}
                                        onChange={e => setTxSearch(e.target.value)}
                                        className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 transition-all"
                                    />
                                    <select
                                        value={txCategory}
                                        onChange={e => setTxCategory(e.target.value)}
                                        className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none border border-transparent focus:bg-white focus:border-gray-300 transition-all"
                                    >
                                        <option value="">All categories</option>
                                        {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>

                                    <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
                                        {parentsLoading ? (
                                            <div className="flex justify-center py-8">
                                                <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                                            </div>
                                        ) : potentialParents.length === 0 ? (
                                            <p className="text-center py-8 text-sm text-gray-400">No expenses found.</p>
                                        ) : potentialParents.map(parent => (
                                            <div key={parent.id} className="flex justify-between items-center px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors group">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                                                        {parent.merchant}
                                                    </p>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {parent.date} · <span className="font-medium text-gray-600">{fmt(parent.amount)}</span>
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleLinkToTransaction(parent.id)}
                                                    disabled={loading}
                                                    className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors shrink-0 ml-3"
                                                >
                                                    Link
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
