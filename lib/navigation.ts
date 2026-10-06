import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  ListOrdered,
  Settings,
  ShieldCheck,
  Telescope,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar navigation (spec §4). */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Trades", icon: ListOrdered },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/forecasts", label: "Forecasts", icon: Telescope },
  { href: "/setups", label: "Setups", icon: Layers },
  { href: "/rules", label: "Rules", icon: ShieldCheck },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
