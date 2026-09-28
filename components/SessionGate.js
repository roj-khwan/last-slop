"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatBaht } from "../lib/format";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function SessionGate({ token, children }) {
  const [state, setState] = useState({ loading: true, session: null, message: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!uuidPattern.test(token || "")) {
        setState({ loading: false, session: null, message: "invalid" });
        return;
      }
      if (!supabase) {
        setState({ loading: false, session: null, message: "config" });
        return;
      }
      const { data, error } = await supabase.from("sessions").select("id, table_number, token, status, total_amount").eq("token", token).maybeSingle();
      if (!active) return;
      if (error) setState({ loading: false, session: null, message: "We couldn’t check this table. Please try again." });
      else if (!data) setState({ loading: false, session: null, message: "invalid" });
      else setState({ loading: false, session: data, message: "" });
    }
    load();
    return () => { active = false; };
  }, [token]);

  if (state.loading) return <main className="status-screen"><div className="status-seal">✺</div><p className="eyebrow">BUTTER & BLOOM</p><h1>Preparing your table…</h1></main>;
  if (!state.session) return <main className="status-screen"><div className="status-seal">✧</div><p className="eyebrow">BUTTER & BLOOM</p><h1>{state.message === "invalid" ? "Invalid link." : "Just a moment."}</h1><p>{state.message === "invalid" ? "Please ask our team for a fresh QR code." : state.message === "config" ? "Ordering is not configured yet. Please ask staff for help." : state.message}</p></main>;
  if (state.session.status === "closed") return <main className="status-screen"><div className="status-seal">❦</div><p className="eyebrow">TABLE {state.session.table_number}</p><h1>Thank you for visiting Butter & Bloom.</h1><p>This table has been closed.</p>{state.session.total_amount != null && <p className="closed-total">Final total · {formatBaht(state.session.total_amount)}</p>}</main>;
  return typeof children === "function" ? children(state.session) : children;
}
