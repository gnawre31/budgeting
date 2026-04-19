import React, { useState } from "react";
import useTransactionStore from "../store/useTransactionStore";
import { useCategories } from "../hooks/useCategories";

const TYPE_OPTIONS = ["Income", "Expense"];

const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return "";
    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
};

const parseCurrency = (value) => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return parseFloat(value.replace(/[^0-9.-]+/g, "")) || 0;
};

export default function TransactionTable() {
    const { transactions, updateTransaction, deleteTransaction } = useTransactionStore();
    const [expandedNotes, setExpandedNotes] = useState(new Set());
    const { expenseCategories, incomeCategories, alwaysExcludedCategories } = useCategories();

    const toggleNotes = (id) => setExpandedNotes(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const getCategoryOptions = (type) => type === "Income" ? incomeCategories : expenseCategories;

    const handleCategoryChange = (txId, newCategory) => {
        const isMandatory = alwaysExcludedCategories.includes(newCategory);
        updateTransaction(txId, {
            category: newCategory,
            exclude_from_report: isMandatory ? true : undefined
        });
    };

    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const handleAmountBlur = (tx, raw) => {
        const numeric = parseCurrency(raw);
        updateTransaction(tx.id, { amount: numeric, amountInput: undefined, self_amount: numeric, partner_amount: 0 });
    };

    const handleSelfBlur = (tx, raw) => {
        let numeric = parseCurrency(raw);
        if (numeric < 0) numeric = 0;
        if (numeric > tx.amount) numeric = tx.amount;
        updateTransaction(tx.id, { self_amount: numeric, selfInput: undefined, partner_amount: Number((tx.amount - numeric).toFixed(2)) });
    };

    const handlePartnerBlur = (tx, raw) => {
        let numeric = parseCurrency(raw);
        if (numeric < 0) numeric = 0;
        if (numeric > tx.amount) numeric = tx.amount;
        updateTransaction(tx.id, { partner_amount: numeric, partnerInput: undefined, self_amount: Number((tx.amount - numeric).toFixed(2)) });
    };

    const handleSplit = (tx) => {
        const amount = Number(tx.amount) || 0;
        const half = Number((amount / 2).toFixed(2));
        const isSplit = Number(tx.self_amount).toFixed(2) === half.toFixed(2);
        if (isSplit) {
            updateTransaction(tx.id, { self_amount: amount, partner_amount: 0 });
        } else {
            updateTransaction(tx.id, { self_amount: half, partner_amount: Number((amount - half).toFixed(2)) });
        }
    };

    const inlineInput = "w-full bg-transparent rounded-lg px-2 py-1 outline-none text-sm text-gray-900 focus:bg-gray-100 focus:ring-1 focus:ring-blue-500/30 transition-all";
    const inlineInputRight = inlineInput + " text-right font-mono";
    const inlineSelect = "w-full bg-transparent rounded-lg px-2 py-1 outline-none text-sm text-gray-900 focus:bg-gray-100 transition-all cursor-pointer";

    return (
        <div className="w-full overflow-x-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <table className="w-full border-collapse table-auto">
                <thead>
                    <tr className="bg-gray-50 text-left border-b border-gray-100">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap w-32">Date</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[160px]">Merchant</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap w-36">Type</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Category</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right w-36">Amount</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right w-36">Self</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right w-36">Partner</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center w-36">Actions</th>
                    </tr>
                </thead>

                <tbody>
                    {sortedTransactions.map((tx) => {
                        const categoryOptions = getCategoryOptions(tx.type);
                        const isMandatoryExclude = alwaysExcludedCategories.includes(tx.category);
                        const notesOpen = expandedNotes.has(tx.id);
                        const hasNotes = tx.description && tx.description.trim().length > 0;
                        const isExcluded = tx.exclude_from_report || false;

                        return (
                            <React.Fragment key={tx.id}>
                                <tr className={`border-b ${notesOpen ? 'border-gray-50' : 'border-gray-100'} hover:bg-gray-50/60 transition-colors ${isExcluded ? 'opacity-50' : ''}`}>
                                    {/* Date */}
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="date"
                                            value={tx.date}
                                            onChange={(e) => updateTransaction(tx.id, { date: e.target.value })}
                                            className={inlineInput}
                                        />
                                    </td>

                                    {/* Merchant + notes */}
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <div className="flex-1 min-w-0">
                                                <input
                                                    type="text"
                                                    value={tx.merchant}
                                                    onChange={(e) => updateTransaction(tx.id, { merchant: e.target.value })}
                                                    className={inlineInput + " font-medium"}
                                                />
                                                {hasNotes && !notesOpen && (
                                                    <p
                                                        onClick={() => toggleNotes(tx.id)}
                                                        className="text-[11px] text-gray-400 truncate mt-0.5 px-2 cursor-pointer hover:text-gray-600 transition-colors"
                                                        title={tx.description}
                                                    >
                                                        {tx.description}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => toggleNotes(tx.id)}
                                                title={notesOpen ? "Hide note" : hasNotes ? "Edit note" : "Add note"}
                                                className={`shrink-0 p-1 rounded-md transition-colors ${notesOpen || hasNotes ? 'text-blue-400 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>

                                    {/* Type — Income/Expense pill toggle */}
                                    <td className="px-4 py-2.5">
                                        <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit">
                                            {TYPE_OPTIONS.map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => {
                                                        if (tx.type === type) return;
                                                        const defaultCat = getCategoryOptions(type)[0];
                                                        updateTransaction(tx.id, {
                                                            type,
                                                            category: defaultCat,
                                                            exclude_from_report: alwaysExcludedCategories.includes(defaultCat) ? true : tx.exclude_from_report
                                                        });
                                                    }}
                                                    className={`text-xs font-medium px-2.5 py-1 transition-colors whitespace-nowrap ${
                                                        tx.type === type
                                                            ? type === "Income"
                                                                ? "bg-green-500 text-white"
                                                                : "bg-rose-500 text-white"
                                                            : "bg-white text-gray-400 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </td>

                                    {/* Category */}
                                    <td className="px-4 py-2.5">
                                        <select
                                            value={tx.category || categoryOptions[0]}
                                            onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                                            className={inlineSelect + (isMandatoryExclude ? " text-blue-500" : "")}
                                        >
                                            {categoryOptions.map((cat) => (<option key={cat}>{cat}</option>))}
                                        </select>
                                    </td>

                                    {/* Amount */}
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="text"
                                            value={tx.amountInput !== undefined ? tx.amountInput : formatCurrency(tx.amount)}
                                            onChange={(e) => updateTransaction(tx.id, { amountInput: e.target.value, amount: parseCurrency(e.target.value) })}
                                            onBlur={(e) => handleAmountBlur(tx, e.target.value)}
                                            className={inlineInputRight}
                                        />
                                    </td>

                                    {/* Self */}
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="text"
                                            value={tx.selfInput !== undefined ? tx.selfInput : formatCurrency(tx.self_amount)}
                                            onChange={(e) => updateTransaction(tx.id, { selfInput: e.target.value, self_amount: parseCurrency(e.target.value) })}
                                            onBlur={(e) => handleSelfBlur(tx, e.target.value)}
                                            className={inlineInputRight + " text-indigo-500"}
                                        />
                                    </td>

                                    {/* Partner */}
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="text"
                                            value={tx.partnerInput !== undefined ? tx.partnerInput : formatCurrency(tx.partner_amount)}
                                            onChange={(e) => updateTransaction(tx.id, { partnerInput: e.target.value, partner_amount: parseCurrency(e.target.value) })}
                                            onBlur={(e) => handlePartnerBlur(tx, e.target.value)}
                                            className={inlineInputRight + " text-teal-500"}
                                        />
                                    </td>

                                    {/* Actions: Split · Exclude · Delete */}
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => handleSplit(tx)}
                                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                                            >
                                                Split
                                            </button>
                                            <button
                                                onClick={() => !isMandatoryExclude && updateTransaction(tx.id, { exclude_from_report: !isExcluded })}
                                                title={isMandatoryExclude ? "Always excluded" : isExcluded ? "Include in reports" : "Exclude from reports"}
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
                                            <button
                                                onClick={() => deleteTransaction(tx.id)}
                                                className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                title="Delete row"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                {/* Expandable notes row */}
                                {notesOpen && (
                                    <tr className="border-b border-gray-100 bg-blue-50/30">
                                        <td />
                                        <td colSpan={7} className="px-4 pb-2.5 pt-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider shrink-0">Note</span>
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={tx.description || ""}
                                                    onChange={(e) => updateTransaction(tx.id, { description: e.target.value })}
                                                    placeholder="Add a note for this transaction…"
                                                    className="flex-1 text-sm text-gray-700 bg-white border border-blue-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 placeholder:text-gray-300 transition-all"
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') toggleNotes(tx.id); }}
                                                />
                                                <button onClick={() => toggleNotes(tx.id)}
                                                    className="text-xs text-blue-400 hover:text-blue-600 shrink-0 transition-colors">
                                                    Done
                                                </button>
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
    );
}
