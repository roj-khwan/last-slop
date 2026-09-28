"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { minutesSince } from "../../lib/format";

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(ticker);
  }, []);
  useEffect(() => {
    if (!supabase) { setError("Kitchen display is not configured. Add Supabase environment values."); setLoading(false); return; }
    let active = true;
    async function loadOrders() {
      const { data, error: fetchError } = await supabase.from("orders").select("id, session_id, table_number, items, status, created_at").in("status", ["received", "preparing"]).order("created_at", { ascending: true });
      if (!active) return;
      if (fetchError) setError("We couldn’t load the kitchen queue. Please refresh.");
      else setOrders(data || []);
      setLoading(false);
    }
    loadOrders();
    const channel = supabase.channel("kitchen-orders").on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
      const order = payload.new;
      if (!active) return;
      setOrders((current) => order.status === "served" ? current : [...current.filter((row) => row.id !== order.id), order].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
      const order = payload.new;
      if (!active) return;
      setOrders((current) => order.status === "served" ? current.filter((row) => row.id !== order.id) : current.map((row) => row.id === order.id ? order : row));
    }).subscribe((status) => { if (status === "CHANNEL_ERROR") setError("Live updates are unavailable. Refresh to check for new orders."); });
    return () => { active = false; window.clearInterval(ticker); supabase.removeChannel(channel); };
  }, []);

  async function changeStatus(order, status) {
    setError("");
    if (status === "served") setOrders((current) => current.filter((row) => row.id !== order.id));
    else setOrders((current) => current.map((row) => row.id === order.id ? { ...row, status } : row));
    const { data, error: updateError } = await supabase.from("orders").update({ status }).eq("id", order.id).select("id, session_id, table_number, items, status, created_at").single();
    if (updateError) {
      setError("That status change didn’t save. Please try again.");
      const { data: latest } = await supabase.from("orders").select("id, session_id, table_number, items, status, created_at").in("status", ["received", "preparing"]).order("created_at", { ascending: true });
      if (latest) setOrders(latest);
    } else if (status !== "served" && data) setOrders((current) => current.map((row) => row.id === data.id ? data : row));
  }

  return <main className="kitchen-page"><header className="staff-topbar kitchen-bar"><Link href="/">Butter <span>&</span> Bloom</Link><p className="eyebrow">KITCHEN · SERVICE BOARD</p></header><div className="kitchen-head"><div><p className="eyebrow">MADE WITH CARE, SERVED WITH LOVE</p><h1>Order board</h1></div><span className="live-indicator">Live order feed</span></div>
    {error && <div className="kitchen-error" role="alert">{error}</div>}
    <section className="kitchen-grid" aria-live="polite">{loading ? <div className="kitchen-empty"><h2>Opening the pass…</h2></div> : orders.length === 0 ? <div className="kitchen-empty"><h2>No active orders</h2><p>Enjoy the quiet while it lasts. 🎂</p></div> : orders.map((order) => <article key={order.id} className={`kitchen-card ${order.status}`}><div className="kitchen-card-head"><div><p className="eyebrow">TABLE</p><div className="table-number">{order.table_number}</div></div><div className="kitchen-time">{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(order.created_at))}<br />{minutesSince(order.created_at)} min ago<br /><span className={`status-pill ${order.status}`}>{order.status}</span></div></div><ul>{(Array.isArray(order.items) ? order.items : []).map((item, index) => <li key={`${item.item_id}-${index}`}>{item.quantity} × {item.name}</li>)}</ul><div className="kitchen-actions">{order.status === "received" && <button type="button" onClick={() => changeStatus(order, "preparing")}>Start preparing</button>}<button type="button" onClick={() => changeStatus(order, "served")}>Served</button></div></article>)}</section>
  </main>;
}
