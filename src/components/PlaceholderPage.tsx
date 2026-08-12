"use client";

type PlaceholderPageProps = {
  title: string;
  subtitle: string;
};

export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      <section className="content-card placeholder-card">
        <h2>Demnächst verfügbar</h2>
        <p>Dieser Bereich ist in der Navigation vorbereitet und kann als Nächstes ausgebaut werden.</p>
      </section>
    </div>
  );
}
