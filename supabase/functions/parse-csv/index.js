import { createClient } from "@supabase/supabase-js";

// Supabase client with service_role key for server-side writes
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "transactions array is required" });
    }

    // Insert directly into Supabase
    const { data, error } = await supabase
      .from("transactions")
      .insert(transactions);

    if (error) throw error;

    res.status(200).json({ inserted: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
