"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SessionGate from "../../../components/SessionGate";
import CustomerHeader from "../../../components/CustomerHeader";
import { supabase } from "../../../lib/supabaseClient";
import { cartTotal, getCart, removeFromCart, setQuantity, clearCart } from "../../../lib/cart";
import { formatBaht } from "../../../lib/format";

export default function CartPage({ params }) {
  const { token } = use(params);
  return <SessionGate token={token}>{(session) => <CartContent token={token} session={session} />}</SessionGate>;
}

function CartContent({ token, session }) {
  const router = useRouter();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setCart(getCart(token)); setLoading(false); }, [token]);
  const refresh = (next) => { setCart(next); setMessage(""); setError(""); };

  async function sendOrder() {
    if (submitting || !cart.length || !supabase) return;
    setSubmitting(true); setMessage(""); setError("");
    try {
      const { data: latestSession, error: sessionError } = await supabase.from("sessions").select("id, table_number, status").eq("id", session.id).maybeSingle();
      if (sessionError) { setError("We couldn’t confirm your table is still open. Please try again."); return; }
      if (!latestSession || latestSession.status !== "open") { setError("This table has been closed. Your order was not sent."); return; }
      const itemIds = cart.map((line) => line.item_id);
      const { data: currentItems, error: itemsError } = await supabase.from("menu_items").select("id, name, price, is_available").in("id", itemIds);
      if (itemsError) { setError("We couldn’t check the latest menu. Please try again."); return; }
      const byId = new Map((currentItems || []).map((item) => [String(item.id), item]));
      const unavailable = cart.filter((line) => !byId.get(String(line.item_id)) || !byId.get(String(line.item_id)).is_available);
      if (unavailable.length) {
        let revised = cart;
        unavailable.forEach((line) => { revised = removeFromCart(token, line.item_id); });
        setCart(revised); setMessage(`${unavailable.map((line) => line.name).join(", ")} ${unavailable.length === 1 ? "is" : "are"} no longer available and ${unavailable.length === 1 ? "has" : "have"} been removed. Please review your cart.`);
        return;
      }
      const changed = cart.filter((line) => Number(byId.get(String(line.item_id)).price) !== Number(line.price));
      if (changed.length) {
        let revised = getCart(token);
        revised = revised.map((line) => ({ ...line, price: Number(byId.get(String(line.item_id)).price), name: byId.get(String(line.item_id)).name }));
        try { window.localStorage.setItem(`cart:${token}`, JSON.stringify(revised)); window.dispatchEvent(new CustomEvent("cart-updated", { detail: { token } })); } catch {}
        setCart(revised); setMessage("Some prices have changed. Please review your updated cart before sending your order.");
        return;
      }
      const snapshot = cart.map((line) => ({ item_id: line.item_id, name: line.name, price: Number(line.price), quantity: Number(line.quantity) }));
      const { error: insertError } = await supabase.from("orders").insert({ session_id: session.id, table_number: session.table_number, items: snapshot, status: "received" });
      if (insertError) { setError("Your order couldn’t be sent. Nothing was charged; please try again."); return; }
      clearCart(token);
      router.push(`/order/${token}?sent=1`);
    } catch {
      setError("Something went wrong while sending your order. Please try again.");
    } finally { setSubmitting(false); }
  }

  return <><CustomerHeader token={token} session={session} active="cart" /><main className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">A MOMENT TO REVIEW</p><h1>Your cart</h1><p>Everything is made fresh, just for you.</p></div></div>
    {error && <div className="message error" role="alert">{error}</div>}{message && <div className="message" role="status">{message}</div>}
    {loading ? <div className="panel">Gathering your treats…</div> : cart.length === 0 ? <div className="empty-state"><div className="status-seal">❧</div><h2>Your basket is awaiting a treat</h2><p>Choose something lovely from our menu.</p><Link className="button button-primary" href={`/order/${token}`}>Back to menu</Link></div> : <>
      <div className="cart-lines">{cart.map((line) => <article className="cart-line" key={line.item_id}><div><h2>{line.name}</h2><span className="muted">{formatBaht(line.price)} each</span></div><span className="line-total">{formatBaht(Number(line.price) * line.quantity)}</span><div className="cart-line-actions"><div className="quantity-control"><button type="button" aria-label={`Decrease ${line.name}`} onClick={() => refresh(setQuantity(token, line.item_id, line.quantity - 1))}>−</button><span>{line.quantity}</span><button type="button" aria-label={`Increase ${line.name}`} onClick={() => refresh(setQuantity(token, line.item_id, line.quantity + 1))}>＋</button></div><button className="remove-link" type="button" onClick={() => refresh(removeFromCart(token, line.item_id))}>Remove</button></div></article>)}</div>
      <aside className="summary-card"><div className="summary-row"><span>Subtotal</span><strong>{formatBaht(cartTotal(cart))}</strong></div><p className="summary-note">Prices in THB. Your final bill is on the Bill page.</p><button className="button button-primary request-bill" type="button" onClick={sendOrder} disabled={submitting || !cart.length}>{submitting ? "Sending to the kitchen…" : "Send to kitchen"}<span aria-hidden="true">↗</span></button></aside>
    </>}
  </main></>;
}
