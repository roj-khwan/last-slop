"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SessionGate from "../../../components/SessionGate";
import CustomerHeader from "../../../components/CustomerHeader";
import { supabase } from "../../../lib/supabaseClient";
import { addToCart, cartCount, cartTotal, getCart } from "../../../lib/cart";
import { formatBaht } from "../../../lib/format";

export default function OrderPage({ params }) {
  const { token } = use(params);
  return <SessionGate token={token}>{(session) => <MenuContent token={token} session={session} />}</SessionGate>;
}

function MenuContent({ token, session }) {
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sentBanner, setSentBanner] = useState(searchParams.get("sent") === "1");

  useEffect(() => {
    let active = true;
    async function loadMenu() {
      if (!supabase) { setError("Menu is unavailable until Supabase is configured."); setLoading(false); return; }
      const [categoryResult, itemResult] = await Promise.all([
        supabase.from("menu_categories").select("id, name, sort_order").order("sort_order"),
        supabase.from("menu_items").select("id, category_id, name, price, is_available").eq("is_available", true),
      ]);
      if (!active) return;
      if (categoryResult.error || itemResult.error) setError("We couldn’t load the menu. Please refresh or ask our team for help.");
      else { setCategories(categoryResult.data || []); setItems(itemResult.data || []); setActiveCategory(categoryResult.data?.[0]?.id ?? null); }
      setLoading(false);
    }
    loadMenu();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sync = (event) => { if (!event?.detail?.token || event.detail.token === token) setCart(getCart(token)); };
    sync(); window.addEventListener("cart-updated", sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("cart-updated", sync); window.removeEventListener("storage", sync); };
  }, [token]);

  const visibleItems = useMemo(() => items.filter((item) => String(item.category_id) === String(activeCategory)), [items, activeCategory]);
  const countInCart = (itemId) => cart.find((line) => String(line.item_id) === String(itemId))?.quantity || 0;
  return <><CustomerHeader token={token} session={session} active="menu" /><main className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">BAKED WITH A LITTLE WONDER</p><h1>Our menu</h1><p>Take your time. There’s something lovely for everyone.</p></div><span className="ornament-kicker" aria-hidden="true">❧</span></div>
    {sentBanner && <div className="message success" role="status">Your order is on its way to the kitchen! <button className="remove-link" type="button" onClick={() => setSentBanner(false)}>Dismiss</button></div>}
    {error && <div className="message error" role="alert">{error}</div>}
    {!error && <>
      {loading ? <div className="panel">Bringing out the menu…</div> : categories.length === 0 ? <div className="empty-state"><h2>The menu is resting</h2><p>Please ask our team for today’s selection.</p></div> : <>
        <div className="category-tabs" role="tablist" aria-label="Menu categories">{categories.map((category) => <button key={category.id} type="button" role="tab" aria-selected={String(activeCategory) === String(category.id)} className={String(activeCategory) === String(category.id) ? "selected" : ""} onClick={() => setActiveCategory(category.id)}>{category.name}</button>)}</div>
        <div className="menu-grid">{visibleItems.map((item) => <article className="menu-card" key={item.id}><div><span className="item-category">Fresh from our kitchen</span><h2>{item.name}</h2><p className="price">{formatBaht(item.price)}</p></div><div className="menu-card-bottom"><span className="in-cart">{countInCart(item.id) ? `In cart: ${countInCart(item.id)}` : "Made for your moment"}</span><button className="small-add" type="button" onClick={() => addToCart(token, item)}>Add <span aria-hidden="true">＋</span></button></div></article>)}</div>
        {visibleItems.length === 0 && <div className="empty-state"><h2>Something sweet is coming</h2><p>There are no available treats in this category just now.</p></div>}
      </>}
    </>}
  </main>{cartCount(cart) > 0 && <Link className="floating-cart" href={`/cart/${token}`}><span><strong>{cartCount(cart)} {cartCount(cart) === 1 ? "item" : "items"}</strong> · {formatBaht(cartTotal(cart))}</span><span className="button">View cart <span aria-hidden="true">→</span></span></Link>}</>;
}
