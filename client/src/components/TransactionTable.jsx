import React from "react";
import useTransactionStore from "../store/useTransactionStore";

const ALWAYS_EXCLUDED_CATEGORIES = ["Reimbursement", "Credit Card Payment", "Internal Transfer"];
const TYPE_OPTIONS = ["Income", "Expense"];
const EXPENSE_OPTIONS = [
    "Other", "Restaurant", "Groceries", "Transportation",
    "Bill Payment", "Entertainment", "Shopping", "Rent",
    "Utilities", "Credit Card Payment", "Internal Transfer"
];
const INCOME_OPTIONS = ["Salary", "Freelance", "E-Transfer", "Reimbursement", "Gift", "Other"];

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

    const getCategoryOptions = (type) => type === "Income" ? INCOME_OPTIONS : EXPENSE_OPTIONS;

    const handleCategoryChange = (txId, newCategory) => {
        const isMandatory = ALWAYS_EXCLUDED_CATEGORIES.includes(newCategory);
        updateTransaction(txId, {
            category: newCategory,
            exclude_from_report: isMandatory ? true : undefined
        });
    };

    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const handleAmountBlur = (tx, raw) => {
        const numeric = parseCurrency(raw);
        updateTransaction(tx.id, {
            amount: numeric,
            amountInput: undefined,
            self_amount: numeric,
            partner_amount: 0
        });
    };

    const handleSelfBlur = (tx, raw) => {
        let numeric = parseCurrency(raw);
        if (numeric < 0) numeric = 0;
        if (numeric > tx.amount) numeric = tx.amount;
        updateTransaction(tx.id, {
            self_amount: numeric,
            selfInput: undefined,
            partner_amount: Number((tx.amount - numeric).toFixed(2))
        });
    };

    const handlePartnerBlur = (tx, raw) => {
        let numeric = parseCurrency(raw);
        if (numeric < 0) numeric = 0;
        if (numeric > tx.amount) numeric = tx.amount;
        updateTransaction(tx.id, {
            partner_amount: numeric,
            partnerInput: undefined,
            self_amount: Number((tx.amount - numeric).toFixed(2))
        });
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

    /* Shared inline input style — transparent at rest, styled on focus */
    const inlineInput = "w-full bg-transparent rounded-lg px-2 py-1 outline-none text-sm text-gray-900 focus:bg-gray-100 focus:ring-1 focus:ring-blue-500/30 transition-all";
    const inlineInputRight = inlineInput + " text-right font-mono";
    const inlineSelect = "w-full bg-transparent rounded-lg px-2 py-1 outline-none text-sm text-gray-900 focus:bg-gray-100 transition-all";

    return (
        <div className="w-full overflow-x-auto bg-white rounded-2xl border border-gray-200/60 shadow-sm">
            <table className="w-full border-collapse table-auto">
                <thead>
                    <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap w-28">Date</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[120px]">Merchant</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap w-24">Type</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Category</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right w-28">Amount</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right w-24">Self</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-right w-24">Partner</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center w-16">Excl.</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center w-28">Actions</th>
                    </tr>
                </thead>

                <tbody>
                    {sortedTransactions.map((tx) => {
                        const categoryOptions = getCategoryOptions(tx.type);
                        const isMandatoryExclude = ALWAYS_EXCLUDED_CATEGORIES.includes(tx.category);

                        return (
                            <tr
                                key={tx.id}
                                className={`border-b border-gray-100 hover:bg-gray-50/60 transition-colors ${tx.exclude_from_report ? 'opacity-50' : ''}`}
                            >
                                <td className="px-4 py-3">
                                    <input
                                        type="date"
                                        value={tx.date}
                                        onChange={(e) => updateTransaction(tx.id, { date: e.target.value })}
                                        className={inlineInput}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={tx.merchant}
                                        onChange={(e) => updateTransaction(tx.id, { merchant: e.target.value })}
                                        className={inlineInput + " font-medium"}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={tx.type}
                                        onChange={(e) => {
                                            const newType = e.target.value;
                                            const defaultCat = getCategoryOptions(newType)[0];
                                            updateTransaction(tx.id, {
                                                type: newType,
                                                category: defaultCat,
                                                exclude_from_report: ALWAYS_EXCLUDED_CATEGORIES.includes(defaultCat) ? true : tx.exclude_from_report
                                            });
                                        }}
                                        className={inlineSelect}
                                    >
                                        {TYPE_OPTIONS.map((type) => (<option key={type}>{type}</option>))}
                                    </select>
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={tx.category || categoryOptions[0]}
                                        onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                                        className={inlineSelect + (isMandatoryExclude ? " text-blue-500" : "")}
                                    >
                                        {categoryOptions.map((cat) => (<option key={cat}>{cat}</option>))}
                                    </select>
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={tx.description || ""}
                                        onChange={(e) => updateTransaction(tx.id, { description: e.target.value })}
                                        className={inlineInput + " text-gray-500"}
                                        placeholder="Notes…"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={tx.amountInput !== undefined ? tx.amountInput : formatCurrency(tx.amount)}
                                        onChange={(e) => updateTransaction(tx.id, { amountInput: e.target.value, amount: parseCurrency(e.target.value) })}
                                        onBlur={(e) => handleAmountBlur(tx, e.target.value)}
                                        className={inlineInputRight}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={tx.selfInput !== undefined ? tx.selfInput : formatCurrency(tx.self_amount)}
                                        onChange={(e) => updateTransaction(tx.id, { selfInput: e.target.value, self_amount: parseCurrency(e.target.value) })}
                                        onBlur={(e) => handleSelfBlur(tx, e.target.value)}
                                        className={inlineInputRight}
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={tx.partnerInput !== undefined ? tx.partnerInput : formatCurrency(tx.partner_amount)}
                                        onChange={(e) => updateTransaction(tx.id, { partnerInput: e.target.value, partner_amount: parseCurrency(e.target.value) })}
                                        onBlur={(e) => handlePartnerBlur(tx, e.target.value)}
                                        className={inlineInputRight}
                                    />
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        checked={tx.exclude_from_report || false}
                                        disabled={isMandatoryExclude}
                                        onChange={(e) => updateTransaction(tx.id, { exclude_from_report: e.target.checked })}
                                        className="h-3.5 w-3.5 accent-blue-500"
                                    />
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <div className="flex justify-center gap-1.5">
                                        <button
                                            onClick={() => handleSplit(tx)}
                                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-medium rounded-lg transition-colors"
                                        >
                                            Split
                                        </button>
                                        <button
                                            onClick={() => deleteTransaction(tx.id)}
                                            className="px-2.5 py-1 text-red-500 hover:text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
