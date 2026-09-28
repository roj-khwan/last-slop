import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-page">
      <div className="home-frame">
        <div className="brand-mark" aria-hidden="true">✺</div>
        <p className="eyebrow">PÂTISSERIE · EST. WITH LOVE</p>
        <h1>Butter <span>&</span><br />Bloom</h1>
        <div className="ornament-rule"><span>❧</span></div>
        <p className="home-copy">A little table-side indulgence.<br />Made slowly, enjoyed together.</p>
        <div className="home-actions">
          <Link className="button button-primary" href="/generate-qr">Open a table <span aria-hidden="true">↗</span></Link>
          <Link className="button button-outline" href="/kitchen">Kitchen display <span aria-hidden="true">↗</span></Link>
        </div>
        <p className="home-foot">HANDCRAFTED PASTRIES · WARM WELCOME</p>
      </div>
    </main>
  );
}
