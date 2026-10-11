"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  HEADER_GROUPS,
  groupAllowed,
  groupForPath,
  isTabActive,
  itemForPath,
  type NavGroup,
  type NavItem,
  type NavTab,
} from "./app-nav";
import { NavIcon } from "./NavIcon";

export function AppHeader() {
  return (
    <Suspense fallback={<header className="app-header" />}>
      <AppHeaderInner />
    </Suspense>
  );
}

function AppHeaderInner() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { hasApp } = useAuth();
  const pathGroup = groupForPath(pathname);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const search = searchParams.toString();
  const searchStr = search ? `?${search}` : "";
  const pathItem = itemForPath(pathname);
  const tabs = pathItem?.tabs ?? [];
  const pathGroupId = pathGroup && pathGroup.id !== "einstellung" ? pathGroup.id : null;

  useEffect(() => {
    setPickedId(null);
    setCollapsed(false);
  }, [pathname]);

  const expandedId = collapsed ? null : (pickedId ?? pathGroupId);
  const selected = HEADER_GROUPS.find((group) => group.id === expandedId) ?? null;
  const showTabs = Boolean(selected && pathGroupId && selected.id === pathGroupId && tabs.length);

  function selectGroup(group: NavGroup) {
    if (expandedId === group.id) {
      setPickedId(null);
      setCollapsed(true);
      return;
    }
    setCollapsed(false);
    setPickedId(group.id);
  }

  return (
    <header className="app-header">
      <nav className="app-header-row" aria-label="Bereiche">
        {HEADER_GROUPS.map((group) => {
          const expanded = expandedId === group.id;
          const current = pathGroupId === group.id;
          const allowed = groupAllowed(group, hasApp);
          return (
            <button
              key={group.id}
              type="button"
              className={`app-header-icon${expanded ? " is-active" : ""}${current && !expanded ? " is-current" : ""}${allowed ? "" : " is-disabled"}`}
              title={allowed ? group.label : `${group.label} · keine Freigabe`}
              aria-current={current ? "page" : undefined}
              aria-expanded={expanded}
              aria-disabled={!allowed}
              onClick={() => selectGroup(group)}
            >
              <NavIcon type={group.icon} />
              <span>{group.shortLabel}</span>
            </button>
          );
        })}
      </nav>
      {selected ? (
        <nav className="app-header-row is-sub" aria-label={selected.label}>
          {selected.items.map((item) => (
            <HeaderItem key={item.href} item={item} pathname={pathname} allowed={hasApp(item.appId)} />
          ))}
        </nav>
      ) : null}
      {showTabs ? (
        <nav className="app-header-row is-tabs" aria-label={`${pathItem?.label ?? "App"} Register`}>
          {tabs.map((tab) => (
            <HeaderTab
              key={tab.href}
              tab={tab}
              pathname={pathname}
              search={searchStr}
              allowed={pathItem ? hasApp(pathItem.appId) : false}
            />
          ))}
        </nav>
      ) : null}
    </header>
  );
}

function HeaderItem({
  item,
  pathname,
  allowed,
}: {
  item: NavItem;
  pathname: string;
  allowed: boolean;
}) {
  const active = item.match(pathname);
  const label = item.shortLabel || item.label;
  const className = `app-header-icon${active ? " is-active" : ""}${allowed ? "" : " is-disabled"}`;
  const title = allowed ? `${item.label} · ${item.description}` : `${item.label} · keine Freigabe`;

  if (!allowed) {
    return (
      <span className={className} title={title} aria-disabled="true">
        <NavIcon type={item.icon} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <Link href={item.href} prefetch className={className} title={title} aria-current={active ? "page" : undefined}>
      <NavIcon type={item.icon} />
      <span>{label}</span>
    </Link>
  );
}

function HeaderTab({
  tab,
  pathname,
  search,
  allowed,
}: {
  tab: NavTab;
  pathname: string;
  search: string;
  allowed: boolean;
}) {
  const active = isTabActive(tab, pathname, search);
  const className = `app-header-icon${active ? " is-active" : ""}${allowed ? "" : " is-disabled"}`;
  const title = allowed ? tab.label : `${tab.label} · keine Freigabe`;

  if (!allowed) {
    return (
      <span className={className} title={title} aria-disabled="true">
        <NavIcon type={tab.icon} />
        <span>{tab.shortLabel}</span>
      </span>
    );
  }

  return (
    <Link href={tab.href} prefetch className={className} title={title} aria-current={active ? "page" : undefined}>
      <NavIcon type={tab.icon} />
      <span>{tab.shortLabel}</span>
    </Link>
  );
}
