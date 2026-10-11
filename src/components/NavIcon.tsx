import type { NavIconType } from "./app-nav";

export function NavIcon({ type }: { type: NavIconType }) {
  const path = ICON_PATHS[type] ?? ICON_PATHS.truck;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="nav-icon">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

const ICON_PATHS: Record<NavIconType, string> = {
  map: "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z",
  sla: "M7 2h10v2h3v16H4V4h3V2zm2 2v2h6V4H9zm1 6h4v2h-4v-2zm0 4h7v2h-7v-2z",
  meeting:
    "M8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM2 19v-1c0-2.2 2.7-4 6-4s6 1.8 6 4v1H2zm12 0v-1c0-1.1.5-2.1 1.3-2.9A8.5 8.5 0 0 1 22 18v1H14z",
  wissen:
    "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 3.5 2.5 1.5L20 12l-1.5-1L13 14v2.5z",
  verwaltung: "M4 4h7v7H4V4zm9 0h7v2h-7V4zm0 4h7v2h-7V8zm0 4h7v2h-7v-2zM4 13h7v7H4v-7z",
  technikerverwaltung:
    "M9 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm6.5-1a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 15.5 10zM3 19v-1c0-2.2 2.7-4 6-4s6 1.8 6 4v1H3zm11 0v-.6c0-1-.3-1.9-.9-2.6A7.6 7.6 0 0 1 21 18.4V19h-7z",
  disposition: "M3 4h18v4H3V4zm0 6h8v10H3V10zm10 0h8v6h-8v-6zm0 8h8v2h-8v-2z",
  urlaube:
    "M7 2h2v2h6V2h2v2h3v16H4V4h3V2zm13 8H6v10h14V10zm-9 2h2v2H11v-2zm4 0h2v2h-2v-2zm-4 4h2v2H11v-2zm4 0h2v2h-2v-2z",
  serviceboard: "M3 4h5v16H3V4zm7 0h5v10h-5V4zm7 0h4v13h-4V4z",
  hprechnungen: "M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 11h8v2H8v-2zm0 4h8v2H8v-2z",
  partnerrechnungen:
    "M4 3h8.5L16 6.5V14H4V3zm8 1.6V7h2.4L12 4.6zM6 9h6v1.6H6V9zm0 3h6v1.6H6V12zm7.2 4H20l2 2.4V21H11.5l-2-2.4V16h3.7z",
  kostenvoranschlaege:
    "M7 2h8l5 5v15H7V2zm7 1.6V8h4.4L14 3.6zM9 11h8v1.7H9V11zm0 3.3h8V16H9v-1.7zm0 3.3h5.5V19H9v-1.4z",
  users:
    "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8v-1c0-2.2 3.1-4 7-4s7 1.8 7 4v1H5zm14.5-9a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 19.5 11zM16 20v-.6c0-1-.3-1.9-.9-2.6A7.6 7.6 0 0 1 22 19.4V20h-6z",
  mail: "M3 5h18v14H3V5zm9 7 8-5H4l8 5zm0 2.2L4 9.2V17h16V9.2l-8 5z",
  truck:
    "M3 7h11v8H3V7zm12 2h3.5L21 12.5V15h-6V9zM6 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  kunden: "M4 10l8-6 8 6v10H4V10zm8-3.2L6 11v7h4v-4h4v4h4v-7l-6-4.2z",
  serviceleitung:
    "M12 3a7 7 0 0 0-7 7v3H3v6h6v-6H7v-3a5 5 0 0 1 10 0v3h-2v6h6v-6h-2v-3a7 7 0 0 0-7-7z",
  philipp: "M7 7V6a5 5 0 0 1 10 0v1h2v14H5V7h2zm2 0h6V6a3 3 0 0 0-6 0v1z",
  releases: "M7 2h7l5 5v13H7V2zm6 1.7V8h4.3L13 3.7zM9 11h8v2H9v-2zm0 4h6v2H9v-2z",
  gear: "M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2L4.5 14.6l2 3.4 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.3-2.9a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.4zm-7.4 2.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z",
  chart: "M4 19h16v2H4v-2zM6 10h3v8H6v-8zm4.5-6h3v14h-3V4zM15 13h3v5h-3v-5z",
  clock: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.6 3.2 1.9-.9 1.5L11 13.2V6h2v6.6z",
  import: "M11 3h2v9.2l3-3 1.4 1.4L12 16.1 6.6 10.6 8 9.2l3 3V3zM5 18h14v2H5v-2z",
  assign: "M16 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-4 1.4A1.4 1.4 0 1 1 10.6 5.8 1.4 1.4 0 0 1 12 4.4zM9 9h6v2H9V9zm0 4h6v2H9v-2z",
  list: "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z",
  calendar:
    "M7 2h2v2h6V2h2v2h3v16H4V4h3V2zm13 8H6v10h14V10zm-9 2h2v2H11v-2zm4 0h2v2h-2v-2zm-4 4h2v2H11v-2zm4 0h2v2h-2v-2z",
  dashboard: "M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10 5h8v3h-8v-3zm0-5h8v3h-8v-3z",
  prio: "M12 2l2.5 7.2H22l-6 4.4 2.3 7.2L12 16.8 5.7 20.8 8 13.6 2 9.2h7.5z",
  pin: "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z",
  task: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  travel: "M8 7V6a4 4 0 0 1 8 0v1h3v13H5V7h3zm2 0h4V6a2 2 0 0 0-4 0v1z",
  folder: "M3 6h7l2 2h9v12H3V6z",
  inbox: "M3 5h18v14H3V5zm2 2v3.2L12 15l7-4.8V7H5z",
  file: "M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5z",
  bot: "M12 2a2 2 0 0 1 2 2v1h4v13H6V5h4V4a2 2 0 0 1 2-2zM9 10h2v2H9v-2zm4 0h2v2h-2v-2zM9 15h6v2H9v-2z",
  garantiefaelle: "M12 2 4 6v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V6l-8-4zm-1 13.2-3.2-3.2 1.4-1.4L11 12.4l4.8-4.8 1.4 1.4z",
  phone:
    "M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z",
  lexmark:
    "M6 3h12v3H6V3zm-2 5h16v11H4V8zm3 2v7h10v-7H7zm2 2h6v3H9v-3z",
  schema:
    "M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm0 4a5 5 0 1 0 5 5h-2a3 3 0 1 1-3-3V7zm-1 2h2v2h-2V9zm4 6h2v2h-2v-2zm-6 0h2v2H9v-2z",
};
