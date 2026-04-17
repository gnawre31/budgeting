import React, { useState, useEffect } from "react";
import { getCategorizationRules, createCategorizationRule, deleteCategorizationRule } from "../services/transactionService";

export default function RuleManager() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newRule, setNewRule] = useState({
        keyword: "",
        transaction_type: "Expense",
        category: "Groceries",
        rename_to: ""
    });

    useEffect(() => { loadRules(); }, []);

    const loadRules = async () => {
        try {
            const data = await getCategorizationRules();
            setRules(data);
        } catch (err) { console.error(err); }
    };

    const handleAddRule = async (e) => {
        e.preventDefault();
        if (!newRule.keyword) return;
        setLoading(true);
        try {
            await createCategorizationRule(newRule);
            setNewRule({ keyword: "", transaction_type: "Expense", category: "Groceries", rename_to: "" });
            await loadRules();
        } catch (err) { alert(err.message); }
        finally { setLoading(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this rule?")) return;
        try {
            await deleteCategorizationRule(id);
            await loadRules();
        } catch (err) { alert(err.message); }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Automation Rules</h2>

            {/* Rule Form */}
            <form onSubmit={handleAddRule} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">If Merchant Contains</label>
                    <input
                        type="text"
                        placeholder="e.g. Starbucks"
                        className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={newRule.keyword}
                        onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Type</label>
                    <select
                        className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={newRule.transaction_type}
                        onChange={(e) => setNewRule({ ...newRule, transaction_type: e.target.value })}
                    >
                        <option value="Expense">Expense</option>
                        <option value="Income">Income</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Set Category To</label>
                    <select
                        className="w-full bg-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none border border-transparent focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        value={newRule.category}
                        onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                    >
                        <option value="Groceries">Groceries</option>
                        <option value="Restaurant">Restaurant</option>
                        <option value="Transportation">Transportation</option>
                        <option value="Bill Payment">Bill Payment</option>
                        <option value="Rent">Rent</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Salary">Salary</option>
                    </select>
                </div>
                <div className="flex items-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors disabled:opacity-40"
                    >
                        {loading ? "Adding…" : "Add Rule"}
                    </button>
                </div>
            </form>

            {/* Rules List */}
            <div className="space-y-1">
                {rules.length === 0 && (
                    <p className="text-center text-gray-400 py-6 text-sm">No rules yet. Add one above.</p>
                )}
                {rules.map(rule => (
                    <div key={rule.id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 transition group">
                        <div className="flex items-center gap-3">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                {rule.transaction_type}
                            </span>
                            <p className="text-sm text-gray-900">
                                If <span className="font-semibold text-blue-500">"{rule.keyword}"</span>
                                <span className="text-gray-400 mx-1.5">→</span>
                                <span className="font-semibold text-gray-900">{rule.category}</span>
                            </p>
                        </div>
                        <button
                            onClick={() => handleDelete(rule.id)}
                            className="text-sm font-medium text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-all px-2"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
