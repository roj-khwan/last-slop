"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { formatBaht, minutesSince } from "../../lib/format";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function GenerateQrPage() {
  const [tableInput, setTableInput] = useState("");
  const [session, setSession] = useState(null);
  const [existing, setExisting] = useState(null);
  const [existingStats, setExistingStats] = useState({ count: 0, total: 0, minutes: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const tableNumber = Number(tableInput);

  async function findOpenTable(number) {
    const { data, error: lookupError } = await supabase.from("sessions").select("id, table_number, token, created_at").eq("table_number", number).eq("status", "open").maybeSingle();
    if (lookupError) throw lookupError;
    if (data) await showExisting(data);
    return data;
  }

  async function showExisting(row) {
    setExisting(row);
    const { data, error: ordersError } = await supabase.from("orders").select("items").eq("session_id", row.id);
    if (ordersError) { setError("The table is open, but we couldn’t load its order summary."); return; }
    const orders = data || [];
    const total = orders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items : []).reduce((sub, item) => sub + Number(item.price) * Number(item.quantity), 0), 0);
    setExistingStats({ count: orders.length, total, minutes: minutesSince(row.created_at) });
  }

  async function openTable(event) {
    event.preventDefault(); setError(""); setSession(null); setExisting(null);
    if (!Number.isInteger(tableNumber) || tableNumber < 1) { setError("Enter a positive whole table number."); return; }
    if (!supabase) { setError("Supabase is not configured. Add the project URL and anon key to your environment."); return; }
    setBusy(true);
    try {
      const found = await findOpenTable(tableNumber);
      if (found) { setBusy(false); return; }
      const { data, error: insertError } = await supabase.from("sessions").insert({ table_number: tableNumber }).select("id, table_number, token").single();
      if (insertError) {
        if (insertError.code === "23505") {
          const latest = await findOpenTable(tableNumber);
          if (!latest) setError("This table has just been opened by another staff member. Refresh and try again.");
        } else setError("We couldn’t open this table. Please try again.");
      } else setSession(data);
    } catch {
      setError("We couldn’t check this table. Please try again.");
    } finally { setBusy(false); }
  }

  async function closeOldOrder() {
    if (!existing || !supabase) return;
    setBusy(true); setError("");
    const { error: closeError } = await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString(), total_amount: existingStats.total }).eq("id", existing.id).eq("status", "open");
    if (closeError) setError("We couldn’t close this table. Please try again.");
    else { setExisting(null); setDialogOpen(false); }
    setBusy(false);
  }

  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("Copy was unavailable. Select and copy the link above."); }
  }

  const customerUrl = session && typeof window !== "undefined" ? `${window.location.origin}/order/${session.token}` : "";
  return <main>
    <header className="staff-topbar"><Link href="/">Butter <span>&</span> Bloom</Link><p className="eyebrow">FRONT OF HOUSE</p></header>
    <section className="staff-wrap">
      <p className="eyebrow">A NEW VISIT BEGINS</p><h1>Open a table</h1><p className="staff-intro">Create a fresh session and set a QR code on the table for your guests.</p>
      {error && <div className="message error" role="alert">{error}</div>}
      {!session && <div className="panel">
        <form onSubmit={openTable}>
          <div className="form-row"><div><label className="field-label" htmlFor="table-number">Table number</label><input className="text-input" id="table-number" type="number" min="1" step="1" required value={tableInput} onChange={(event) => setTableInput(event.target.value)} placeholder="e.g. 5" /></div><button className="button button-primary" disabled={busy}>{busy ? "Checking…" : "Open table"}<span aria-hidden="true">↗</span></button></div>
        </form>
        {existing && <div className="warning-panel"><p className="eyebrow">TABLE {existing.table_number} · ALREADY OPEN</p><h2>This table already has an open order.</h2><p>Please close the previous session before opening another one.</p><button className="button button-outline" type="button" onClick={() => setDialogOpen(true)}>Close old order</button></div>}
      </div>}
      {session && <div className="panel qr-result"><p className="eyebrow">YOUR TABLE IS READY</p><img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(customerUrl)}`} alt={`QR code for table ${session.table_number}`} /><h2>Table {session.table_number}</h2><p className="staff-intro">Guests can scan this code to browse the menu.</p><div className="url-box">{customerUrl}</div><div className="staff-actions"><button className="button button-primary" type="button" onClick={() => copyLink(customerUrl)}>{copied ? "Copied!" : "Copy link"}</button><button className="button button-outline" type="button" onClick={() => { setSession(null); setTableInput(""); setError(""); }}>Open another table</button></div></div>}
    </section>
    {dialogOpen && <ConfirmDialog title="Close the old order?" confirmLabel="Confirm close" onCancel={() => setDialogOpen(false)} onConfirm={closeOldOrder} busy={busy}><p>Table {existing?.table_number} has been open for <strong>{existingStats.minutes} minutes</strong>.</p><p>{existingStats.count} {existingStats.count === 1 ? "order" : "orders"} placed · running total <strong>{formatBaht(existingStats.total)}</strong>.</p></ConfirmDialog>}
  </main>;
}
