import React, { useState } from "react";
import { useCategories } from "../hooks/useCategories";

const TABS = [
    { key: "expense", label: "Expense" },
    { key: "income",  label: "Income"  },
];

function Toggle({ checked, onChange, disabled }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                disabled ? "opacity-40 cursor-not-allowed" :
                checked   ? "bg-gray-800 cursor-pointer" : "bg-gray-200 cursor-pointer"
            }`}
        >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                checked ? "translate-x-[18px]" : "translate-x-[2px]"
            }`} />
        </button>
    );
}

function CategoryRow({ cat, onUpdate, onRemove, deletingId }) {
    const isDeleting = deletingId === cat.id;

    return (
        <li className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50/60 transition-colors group">
            {/* Name */}
            <span className="flex-1 text-sm font-medium text-gray-800">{cat.name}</span>

            {/* Fixed toggle */}
            {cat.type === "expense" && (
                <div className="w-[56px] flex justify-center shrink-0">
                    <Toggle
                        checked={!!cat.is_fixed}
                        onChange={val => onUpdate(cat.id, { is_fixed: val })}
                    />
                </div>
            )}

            {/* Special toggle */}
            <div className="w-[72px] flex justify-center shrink-0">
                <Toggle
                    checked={!!cat.is_special}
                    onChange={val => onUpdate(cat.id, { is_special: val })}
                />
            </div>

            {/* Always exclude toggle */}
            <div className="w-[100px] flex justify-center shrink-0">
                <Toggle
                    checked={!!cat.is_always_excluded}
                    onChange={val => onUpdate(cat.id, { is_always_excluded: val })}
                />
            </div>

            {/* Delete */}
            <button
                onClick={() => onRemove(cat)}
                disabled={isDeleting}
                title="Remove category"
                className="w-7 flex items-center justify-center opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-30"
            >
                {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-rose-400 rounded-full animate-spin" />
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                )}
            </button>
        </li>
    );
}

export default function CategoriesPage() {
    const { categories, loading, dbAvailable, addCategory, updateCategory, removeCategory } = useCategories();

    const [activeTab, setActiveTab]   = useState("expense");
    const [newName, setNewName]       = useState("");
    const [newFixed, setNewFixed]     = useState(false);
    const [newSpecial, setNewSpecial] = useState(false);
    const [newAlwaysEx, setNewAlwaysEx] = useState(false);
    const [adding, setAdding]         = useState(false);
    const [error, setError]           = useState(null);
    const [mutateError, setMutateError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const visible = categories.filter(c => c.type === activeTab);
    const sorted  = [...visible].sort((a, b) => a.name.localeCompare(b.name));

    const handleAdd = async (e) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        const conflict = categories.find(c => c.type === activeTab && c.name.toLowerCase() === name.toLowerCase());
        if (conflict) { setError(`"${conflict.name}" already exists. Category names must be unique (case-insensitive).`); return; }
        setAdding(true); setError(null);
        try {
            await addCategory(name, activeTab, { is_fixed: newFixed, is_special: newSpecial, is_always_excluded: newAlwaysEx });
            setNewName(""); setNewFixed(false); setNewSpecial(false); setNewAlwaysEx(false);
        } catch (err) {
            const msg = err.message || "";
            if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
                setError(`"${name}" already exists (case-insensitive). Please choose a different name.`);
            } else {
                setError(msg);
            }
        }
        finally { setAdding(false); }
    };

    const handleUpdate = async (id, updates) => {
        setMutateError(null);
        try { await updateCategory(id, updates); }
        catch (err) { setMutateError(err.message); }
    };

    const handleRemove = async (cat) => {
        setMutateError(null);
        setDeletingId(cat.id);
        try { await removeCategory(cat.id); }
        catch (err) { setMutateError(err.message); }
        finally { setDeletingId(null); }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-16">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Categories</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    Manage categories for you and your partner. Toggle <strong>Special</strong> on categories
                    that contain one-time or atypical spend (e.g. trips, weddings) so you can filter
                    them out of the dashboard for a clearer view of typical cash flow.
                </p>
            </div>

            {!dbAvailable && !loading && (
                <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <div>
                        <p className="font-medium text-amber-800">Database table not set up yet</p>
                        <p className="text-amber-700 mt-0.5">
                            Run migration <code className="bg-amber-100 px-1 rounded text-xs">003_user_categories_special.sql</code> in your Supabase SQL editor to enable all features.
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => { setActiveTab(t.key); setError(null); setNewName(""); }}
                            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                                activeTab === t.key
                                    ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                                    : "text-gray-400 hover:text-gray-600"
                            }`}>
                            {t.label}
                            <span className="ml-2 text-xs font-normal text-gray-400">
                                ({categories.filter(c => c.type === t.key).length})
                            </span>
                        </button>
                    ))}
                </div>

                {/* Add form */}
                <form onSubmit={handleAdd} className="px-6 pt-5 pb-4 border-b border-gray-100 space-y-3">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder={`New ${activeTab} category…`}
                            value={newName}
                            onChange={e => { setNewName(e.target.value); setError(null); }}
                            className="flex-1 bg-gray-100 rounded-xl px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:bg-white focus:border-gray-300 transition-all"
                        />
                        <button type="submit" disabled={adding || !newName.trim() || !dbAvailable}
                            title={!dbAvailable ? "Run the SQL migration first" : undefined}
                            className="bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors shrink-0">
                            {adding ? "Adding…" : "Add"}
                        </button>
                    </div>
                    {/* Flags for new category */}
                    <div className="flex items-center gap-6 flex-wrap">
                        {activeTab === "expense" && (
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <Toggle checked={newFixed} onChange={setNewFixed} disabled={!dbAvailable} />
                                <span className="text-xs text-gray-500">Fixed expense</span>
                            </label>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Toggle checked={newSpecial} onChange={setNewSpecial} disabled={!dbAvailable} />
                            <span className="text-xs text-gray-500">Special / one-time</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Toggle checked={newAlwaysEx} onChange={setNewAlwaysEx} disabled={!dbAvailable} />
                            <span className="text-xs text-gray-500">Always exclude from reports</span>
                        </label>
                    </div>
                    {error && <p className="text-xs text-rose-500">{error}</p>}
                </form>

                {/* Column headers */}
                <div className="flex items-center gap-4 px-6 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Category</span>
                    {activeTab === "expense" && (
                        <span className="w-[56px] text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Fixed</span>
                    )}
                    <span className="w-[72px] text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Special</span>
                    <span className="w-[100px] text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Always Exclude</span>
                    <span className="w-7" />
                </div>

                {/* Mutation error banner */}
                {mutateError && (
                    <div className="mx-6 mt-3 flex items-center justify-between gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5 text-xs text-rose-600">
                        <span>{mutateError}</span>
                        <button onClick={() => setMutateError(null)} className="font-medium hover:text-rose-800 shrink-0">Dismiss</button>
                    </div>
                )}

                {/* List */}
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                    </div>
                ) : sorted.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-12">No {activeTab} categories yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-50">
                        {sorted.map(cat => (
                            <CategoryRow
                                key={cat.id}
                                cat={cat}
                                onUpdate={handleUpdate}
                                onRemove={handleRemove}
                                deletingId={deletingId}
                            />
                        ))}
                    </ul>
                )}

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    <p className="text-xs text-gray-400">
                        <span className="font-medium text-gray-500">Fixed</span> marks recurring fixed expenses (rent, subscriptions) for the Fixed vs Variable breakdown.{" "}
                        <span className="font-medium text-gray-500">Special</span> categories are filterable on the dashboard.{" "}
                        <span className="font-medium text-gray-500">Always exclude</span> hides transactions from all reports.
                    </p>
                </div>
            </div>
        </div>
    );
}
