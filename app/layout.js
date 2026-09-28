import "./globals.css";

export const metadata = {
  title: "Butter & Bloom Pâtisserie",
  description: "A little table-side indulgence. Browse, order, and linger awhile.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
