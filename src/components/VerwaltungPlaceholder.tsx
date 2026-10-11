type Props = {
  title: string;
  description: string;
};

export function VerwaltungPlaceholder({ title, description }: Props) {
  return (
    <div className="page-panel">
      <header className="section-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <p className="muted-meta">Inhalt folgt – Bereich ist vorbereitet.</p>
    </div>
  );
}
