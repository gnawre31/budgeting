import React, { useState, useEffect, useRef } from "react";
import UploadCSV from "../components/UploadCSV";
import TransactionTable from "../components/TransactionTable";
import RuleManager from "../components/RuleManager";
import useTransactionStore from "../store/useTransactionStore";
import { supabase } from "../lib/supabaseClient";
import { applyRules, commitTransactions, getCategorizationRules } from "../services/transactionService";

export default function UploadPage() {
    const fileInputRef = useRef(null);
    const { transactions, setTransactions, clearTransactions } = useTransactionStore();

    // UI & Loading States
    const [showRules, setShowRules] = useState(false);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [loading, setLoading] = useState(false);

    // Duplicate Review States
    const [conflicts, setConflicts] = useState([]);
    const [nonConflicts, setNonConflicts] = useState([]);
    const [selectedDuplicateIds, setSelectedDuplicateIds] = useState(new Set());
    const [uploadPartnerId, setUploadPartnerId] = useState(null);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) window.location.href = "/";
        };
        checkUser();
    }, []);

    const handleParsed = async (parsed) => {
        setLoading(true);
        clearTransactions();

        try {
            const rules = await getCategorizationRules();
            const processed = parsed.map((tx) => {
                const categorizedTx = applyRules(tx, rules);
                const amount = Number(categorizedTx.amount);
                return {
                    ...categorizedTx,
                    id: crypto.randomUUID(),
                    self_amount: amount,
                    partner_amount: 0,
                };
            });

            setTransactions(processed);
        } catch (err) {
            console.error("Rules Error:", err);
            const fallback = parsed.map(t => ({ ...t, id: crypto.randomUUID(), self_amount: t.amount, partner_amount: 0 }));
            setTransactions(fallback);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkSplit = (fileName, splitType) => {
        const updated = transactions.map(tx => {
            if (tx.sourceFile === fileName) {
                const amount = Number(tx.amount);
                return {
                    ...tx,
                    self_amount: splitType === 'joint' ? amount / 2 : amount,
                    partner_amount: splitType === 'joint' ? amount / 2 : 0,
                };
            }
            return tx;
        });
        setTransactions(updated);
    };

    const handleRemoveFile = (fileName) => {
        if (window.confirm(`Remove all transactions from "${fileName}"?`)) {
            const filtered = transactions.filter(tx => tx.sourceFile !== fileName);
            setTransactions(filtered);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const startUploadFlow = async () => {
        if (!transactions.length) return;
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from("users").select("partner_id").eq("id", user.id).maybeSingle();
            const partnerId = profile?.partner_id ?? null;
            setUploadPartnerId(partnerId);

            const counts = new Map();
            const internalSafe = [];
            const internalConflicts = [];

            // 1. Check for duplicates WITHIN the uploaded files
            transactions.forEach(tx => {
                // FIX: Added tx.type to the unique key
                const key = `${tx.date}|${tx.merchant.toLowerCase().trim()}|${Number(tx.amount).toFixed(2)}|${tx.type}`;
                const currentCount = counts.get(key) || 0;
                counts.set(key, currentCount + 1);

                if (currentCount > 0) internalConflicts.push(tx);
                else internalSafe.push(tx);
            });

            // 2. Fetch existing DB records
            const dates = [...new Set(internalSafe.map(t => t.date))];
            const { data: existing } = await supabase
                .from("transactions")
                .select("date, merchant, amount, type") // FIX: Added type to the query
                .eq("user_id", user.id)
                .in("date", dates);

            const finalSafe = [];
            const dbConflicts = [];

            // 3. Compare uploaded files against DB
            internalSafe.forEach(tx => {
                const key = `${tx.date}|${tx.merchant.toLowerCase().trim()}|${Number(tx.amount).toFixed(2)}|${tx.type}`;

                const isDbDupe = existing?.some(ext =>
                    ext.date === tx.date &&
                    ext.merchant.toLowerCase().trim() === tx.merchant.toLowerCase().trim() &&
                    Math.abs(Number(ext.amount) - Number(tx.amount)) < 0.01 &&
                    ext.type === tx.type // FIX: Check that the types also match
                );

                if (isDbDupe) {
                    counts.set(key, (counts.get(key) || 0) + 1);
                    dbConflicts.push(tx);
                } else {
                    finalSafe.push({ ...tx, partner_id: partnerId });
                }
            });

            // 4. Combine all conflicts
            const allConflicts = [...dbConflicts, ...internalConflicts].map(tx => ({
                ...tx,
                dupeCount: counts.get(`${tx.date}|${tx.merchant.toLowerCase().trim()}|${Number(tx.amount).toFixed(2)}|${tx.type}`)
            }));

            if (allConflicts.length > 0) {
                setConflicts(allConflicts);
                setNonConflicts(finalSafe);
                setSelectedDuplicateIds(new Set());
                setShowDuplicateModal(true);
            } else {
                await executeFinalUpload(finalSafe);
            }
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleDupe = (id) => {
        const next = new Set(selectedDuplicateIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedDuplicateIds(next);
    };

    const handleConfirmDuplicates = () => {
        // Re-attach partner_id to selected dupes (stripped when building the conflicts list)
        const selectedDupes = conflicts
            .filter(tx => selectedDuplicateIds.has(tx.id))
            .map(tx => ({ ...tx, partner_id: uploadPartnerId }));
        executeFinalUpload([...nonConflicts, ...selectedDupes]);
    };

    const executeFinalUpload = async (dataToSave) => {
        setLoading(true);
        try {
            const result = await commitTransactions(dataToSave);
            if (result.error) throw new Error(result.error);
            alert(`Saved ${result.count} transactions.`);
            clearTransactions();
            setShowDuplicateModal(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            alert("Upload failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fileStats = transactions.reduce((acc, tx) => {
        acc[tx.sourceFile] = (acc[tx.sourceFile] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="max-w-6xl mx-auto mt-6 mb-10 px-4 md:px-6 space-y-6">

            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Upload Transactions</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Select files to begin. Choosing new files will reset the current table.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowRules(!showRules)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                        {showRules ? "Close Rules" : "Manage Rules"}
                    </button>
                    <UploadCSV ref={fileInputRef} onDataParsed={handleParsed} />
                </div>
            </div>

            {/* Rule Manager (inline toggle) */}
            {showRules && <RuleManager />}

            {/* File Cards + Table */}
            {transactions.length > 0 && (
                <div className="space-y-5">

                    {/* File Cards */}
                    <div className="flex flex-wrap gap-3">
                        {Object.entries(fileStats).map(([fileName, count]) => (
                            <div
                                key={fileName}
                                className="bg-white border border-gray-200 rounded-xl p-4 relative min-w-[200px] shadow-sm"
                            >
                                <button
                                    onClick={() => handleRemoveFile(fileName)}
                                    className="absolute -top-2 -right-2 w-5 h-5 bg-gray-200 hover:bg-red-100 text-gray-500 hover:text-red-500 rounded-full text-xs flex items-center justify-center transition-colors leading-none"
                                >
                                    &times;
                                </button>
                                <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
                                <p className="text-xs text-gray-400 mt-0.5 mb-3">{count} rows</p>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => handleBulkSplit(fileName, 'individual')}
                                        className="flex-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-full transition-colors"
                                    >
                                        Me
                                    </button>
                                    <button
                                        onClick={() => handleBulkSplit(fileName, 'joint')}
                                        className="flex-1 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-600 py-1.5 rounded-full transition-colors"
                                    >
                                        50/50
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Table Header Row */}
                    <div className="flex justify-between items-center">
                        <p className="text-sm font-semibold text-gray-900">
                            Pending Review
                            <span className="ml-1.5 text-gray-400 font-normal">({transactions.length})</span>
                        </p>
                        <button
                            onClick={startUploadFlow}
                            disabled={loading}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-full transition-colors disabled:opacity-40 flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Checking…
                                </>
                            ) : "Save to Database"}
                        </button>
                    </div>

                    <TransactionTable />
                </div>
            )}

            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Review Duplicates</h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                We found existing records with the exact same date, merchant, amount, and type. Check any you still want to save.
                            </p>
                        </div>

                        {/* Modal Body */}
                        <div className="overflow-y-auto max-h-[50vh]">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Save?</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Merchant</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Matches</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conflicts.map((tx) => (
                                        <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedDuplicateIds.has(tx.id)}
                                                    onChange={() => toggleDupe(tx.id)}
                                                    className="w-4 h-4 cursor-pointer accent-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{tx.date}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{tx.merchant}</td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={tx.type === "Income" ? "text-green-600" : "text-red-500"}>{tx.type}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                                    {tx.dupeCount}x
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 font-mono">
                                                ${Number(tx.amount).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
                            <span className="text-xs text-gray-400">
                                {nonConflicts.length} unique {nonConflicts.length === 1 ? "item" : "items"} will be added automatically.
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowDuplicateModal(false)}
                                    className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmDuplicates}
                                    className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-full transition-colors"
                                >
                                    Save {nonConflicts.length + selectedDuplicateIds.size} Total
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
