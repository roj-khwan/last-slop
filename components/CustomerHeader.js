"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartCount, getCart } from "../lib/cart";

export default function CustomerHeader({ token, session, active = "menu" }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = (event) => { if (!event?.detail?.token || event.detail.token === token) setCount(cartCount(getCart(token))); };
    sync();
    window.addEventListener("cart-updated", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("cart-updated", sync); window.removeEventListener("storage", sync); };
  }, [token]);
  return (
    <header className="customer-header">
      <Link className="customer-brand" href="/">Butter <span>&</span> Bloom <small>TABLE {session.table_number}</small></Link>
      <nav aria-label="Customer navigation">
        <Link className={active === "menu" ? "active" : ""} href={`/order/${token}`}>Menu</Link>
        <Link className={active === "cart" ? "active" : ""} href={`/cart/${token}`}>Cart <span className="nav-count">{count}</span></Link>
        <Link className={active === "bill" ? "active" : ""} href={`/bill/${token}`}>Bill</Link>
      </nav>
    </header>
  );
}
