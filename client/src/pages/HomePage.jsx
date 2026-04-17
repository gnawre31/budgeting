import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function HomePage() {
    const [user, setUser] = useState(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(true);

    // Check session on load
    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            setLoading(false);
        };

        checkUser();

        // Listen for auth changes
        const { data: listener } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => {
            listener.subscription.unsubscribe();
        };
    }, []);

    const handleLogin = async () => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            alert(error.message);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    if (loading) return <div>Loading...</div>;

    // 🚨 NOT LOGGED IN → SHOW LOGIN FORM
    if (!user) {
        return (
            <div className="max-w-sm mx-auto mt-20 p-6 bg-white rounded shadow">
                <h1 className="text-xl font-bold mb-4">Login</h1>

                <input
                    type="email"
                    placeholder="Email"
                    className="border p-2 w-full mb-3"
                    onChange={(e) => setEmail(e.target.value)}
                />

                <input
                    type="password"
                    placeholder="Password"
                    className="border p-2 w-full mb-3"
                    onChange={(e) => setPassword(e.target.value)}
                />

                <button
                    onClick={handleLogin}
                    className="bg-blue-600 text-white px-4 py-2 rounded w-full"
                >
                    Login
                </button>
            </div>
        );
    }

    // ✅ LOGGED IN → SHOW REAL HOMEPAGE
    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">
                Welcome, {user.email}
            </h1>

            <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded"
            >
                Logout
            </button>
        </div>
    );
}
