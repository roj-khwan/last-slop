"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SessionGate from "../../../components/SessionGate";
import CustomerHeader from "../../../components/CustomerHeader";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { supabase } from "../../../lib/supabaseClient";
import { formatBaht } from "../../../lib/format";

export default function BillPage({ params }) {
  const { token } = use(params);
  return <SessionGate token={token}>{(session) => <BillContent token={token} session={session} />}</SessionGate>;
}

function BillContent({ token, session }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let active = true;
    async function loadOrders() {
      if (!supabase) { setError("The bill is unavailable until Supabase is configured."); setLoading(false); return; }
      const { data, error: fetchError } = await supabase.from("orders").select("id, items, status, created_at").eq("session_id", session.id).order("created_at", { ascending: true });
      if (!active) return;
      if (fetchError) setError("We couldn’t load your orders. Please refresh or ask our team for help.");
      else setOrders(data || []);
      setLoading(false);
    }
    loadOrders(); return () => { active = false; };
  }, [session.id]);

  const rows = useMemo(() => {
    const grouped = new Map();
    orders.forEach((order) => (Array.isArray(order.items) ? order.items : []).forEach((item) => {
      const key = `${item.item_id}:${Number(item.price)}`;
      const current = grouped.get(key) || { item_id: item.item_id, name: item.name, price: Number(item.price), quantity: 0 };
      current.quantity += Number(item.quantity) || 0;
      grouped.set(key, current);
    }));
    return [...grouped.values()];
  }, [orders]);
  const total = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);

  async function requestBill() {
    if (busy || !supabase) return;
    setBusy(true); setError("");
    const { error: closeError } = await supabase.from("sessions").update({ status: "closed", closed_at: new Date().toISOString(), total_amount: total }).eq("id", session.id).eq("status", "open");
    if (closeError) setError("We couldn’t close the table just yet. Please try again or ask our team.");
    else { setDialogOpen(false); setClosed(true); }
    setBusy(false);
  }

  if (closed) return <main className="status-screen"><div className="status-seal">❦</div><p className="eyebrow">BUTTER & BLOOM · TABLE {session.table_number}</p><h1>Thank you!</h1><p>Please pay <strong>{formatBaht(total)}</strong> at the counter. We hope to see you again soon.</p></main>;
  return <><CustomerHeader token={token} session={session} active="bill" /><main className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">A LITTLE RECAP</p><h1>Your bill</h1><p>Every treat, gathered in one place.</p></div></div>
    {error && <div className="message error" role="alert">{error}</div>}
    {loading ? <div className="panel">Adding up the loveliness…</div> : orders.length === 0 ? <div className="empty-state"><div className="status-seal">✧</div><h2>Your table is just beginning</h2><p>You haven’t ordered anything yet.</p><Link className="button button-primary" href={`/order/${token}`}>Browse the menu</Link></div> : <>
      <div className="table-scroll"><table className="bill-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.item_id}:${row.price}:${index}`}><td>{row.name}</td><td>{row.quantity}</td><td>{formatBaht(row.price)}</td><td>{formatBaht(row.price * row.quantity)}</td></tr>)}</tbody><tfoot><tr><td colSpan="3">Grand total</td><td>{formatBaht(total)}</td></tr></tfoot></table></div>
      <p className="summary-note" style={{ marginTop: 12 }}>Payment is made at the counter.</p>
      <h2 className="bill-section-title">Your orders</h2><div className="order-history">{orders.map((order) => <article className="order-card" key={order.id}><div className="order-meta"><time dateTime={order.created_at}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}</time><span className={`status-pill ${order.status}`}>{order.status}</span></div><ul>{(Array.isArray(order.items) ? order.items : []).map((item, index) => <li key={`${item.item_id}-${index}`}>{item.quantity} × {item.name} <span className="muted">· {formatBaht(Number(item.price) * Number(item.quantity))}</span></li>)}</ul></article>)}</div>
      <aside className="summary-card"><div className="summary-row total"><span>Grand total</span><strong>{formatBaht(total)}</strong></div><p className="summary-note">Payment is made at the counter.</p><button className="button button-primary request-bill" type="button" onClick={() => setDialogOpen(true)}>Request bill & close table</button></aside>
    </>}
  </main>{dialogOpen && <ConfirmDialog title="Request your bill?" confirmLabel="Close table" onCancel={() => setDialogOpen(false)} onConfirm={requestBill} busy={busy}><p>Close this table and request your bill? You won’t be able to order more.</p><p>Grand total · <strong>{formatBaht(total)}</strong></p></ConfirmDialog>}</>;
}
