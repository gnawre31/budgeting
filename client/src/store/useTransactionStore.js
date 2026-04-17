import { create } from "zustand";

const useTransactionStore = create((set) => ({
  transactions: [],

  setTransactions: (txs) => set({ transactions: txs }),

  updateTransaction: (id, updates) =>
    set((state) => ({
      transactions: state.transactions.map((tx) =>
        tx.id === id ? { ...tx, ...updates } : tx,
      ),
    })),

  deleteTransaction: (id) =>
    set((state) => ({
      transactions: state.transactions.filter((tx) => tx.id !== id),
    })),

  clearTransactions: () => set({ transactions: [] }),
}));

export default useTransactionStore;
