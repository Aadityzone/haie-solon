"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { salonConfig } from "@/config/salon";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner/login")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setIsConfigured(data.isConfigured);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          isSetup: !isConfigured,
          setupToken,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Authentication failed");
        return;
      }

      router.push("/owner");
    } catch (err: unknown) {
      console.error(err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-charcoal px-4 py-12">
      <div className="w-full max-w-md rounded-sm border border-neutral-800 bg-[#222222] p-8 shadow-2xl">
        <div className="text-center">
          <span className="text-[0.65rem] font-semibold tracking-[0.25em] uppercase text-champagne">
            {salonConfig.name}
          </span>
          <h1 className="mt-2 font-[family-name:var(--font-serif)] text-2xl font-semibold text-ivory">
            {isConfigured === false ? "Initial Setup" : "Owner Portal"}
          </h1>
          <p className="mt-2 text-xs text-neutral-400">
            {isConfigured === false
              ? "No owner password is set yet. Create your master password to secure the dashboard."
              : "Enter your owner master password to manage appointments and salon availability."}
          </p>
        </div>

        {error && (
          <div role="alert" className="mt-6 rounded border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="owner-pass" className="block text-xs font-medium text-neutral-300">
              {isConfigured === false ? "Create Master Password (min 8 chars)" : "Master Password"}
            </label>
            <input
              id="owner-pass"
              type="password"
              required
              minLength={isConfigured === false ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1 w-full rounded-sm border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-ivory outline-none focus:border-champagne focus:ring-1 focus:ring-champagne"
            />
          </div>
          {isConfigured === false && <div>
            <label htmlFor="setup-token" className="block text-xs font-medium text-neutral-300">Owner Setup Token</label>
            <input id="setup-token" type="password" required value={setupToken} onChange={(e) => setSetupToken(e.target.value)} className="mt-1 w-full rounded-sm border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-ivory outline-none focus:border-champagne" />
          </div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-champagne py-3 text-xs font-semibold uppercase tracking-wider text-charcoal transition-colors hover:bg-champagne-light disabled:opacity-50"
          >
            {loading
              ? "Verifying..."
              : isConfigured === false
              ? "Initialize & Sign In"
              : "Access Dashboard"}
          </button>
        </form>

        <div className="mt-6 border-t border-neutral-800 pt-4 text-center">
          <Link href="/" className="inline-flex min-h-11 items-center text-xs text-neutral-500 transition-colors hover:text-champagne">
            ← Return to salon website
          </Link>
        </div>
      </div>
    </main>
  );
}
