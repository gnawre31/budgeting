import React, { useState, useEffect } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import UploadPage from "./pages/UploadPage";
import ReconciliationView from "./pages/ReconciliationView";
import TransactionsPage from "./pages/TransactionsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchDisplayName = async (uid) => {
    const { data } = await supabase.from("users").select("display_name").eq("id", uid).single();
    setDisplayName(data?.display_name ?? null);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchDisplayName(user.id);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchDisplayName(u.id);
      else setDisplayName(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch (err) { console.error("Logout failed:", err); }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F7]">
        <LoginPage />
      </div>
    );
  }

  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors px-3 py-1.5 rounded-lg ${
      isActive ? "text-gray-900 bg-black/[0.06]" : "text-gray-500 hover:text-gray-900 hover:bg-black/[0.04]"
    }`;

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans">
      <nav className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-1">
          <span className="text-sm font-semibold text-gray-900 mr-4">BudgetSync</span>

          <NavLink to="/" end className={navLinkClass}>Dashboard</NavLink>
          <NavLink to="/upload" className={navLinkClass}>Upload CSV</NavLink>
          <NavLink to="/reconcile" className={navLinkClass}>Reconcile</NavLink>
          <NavLink to="/transactions" className={navLinkClass}>Transactions</NavLink>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">{displayName ?? user.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/reconcile" element={<ReconciliationView />} />
          <Route path="/transactions" element={<TransactionsPage />} />
        </Routes>
      </main>
    </div>
  );
}
