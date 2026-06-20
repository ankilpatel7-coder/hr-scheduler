import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  DollarSign,
  FileText,
  CheckSquare,
  Settings,
  PlaneTakeoff,
  ShieldCheck,
  IdCard,
} from "lucide-react";

export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

export type NavItem = {
  label: string;
  href: (tenant: string) => string;
  icon: LucideIcon;
  roles: Role[];
  matchPrefix?: (tenant: string) => string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: (t) => `/${t}/dashboard`,
    icon: LayoutDashboard,
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    label: "Schedule",
    href: (t) => `/${t}/schedule`,
    icon: Calendar,
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    label: "Timesheets",
    href: (t) => `/${t}/timesheets`,
    icon: Clock,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Approvals",
    href: (t) => `/${t}/approvals`,
    icon: CheckSquare,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Employees",
    href: (t) => `/${t}/admin/employees`,
    icon: Users,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => `/${t}/admin/employees`,
  },
  {
    label: "Payroll",
    href: (t) => `/${t}/payroll`,
    icon: DollarSign,
    roles: ["ADMIN"],
  },
  {
    label: "Documents",
    href: (t) => `/${t}/admin/documents`,
    icon: FileText,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => `/${t}/admin/documents`,
  },
  {
    label: "Time off",
    href: (t) => `/${t}/admin/time-off`,
    icon: PlaneTakeoff,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Settings",
    href: (t) => `/${t}/admin/settings`,
    icon: Settings,
    roles: ["ADMIN"],
    matchPrefix: (t) => `/${t}/admin/settings`,
  },
];

// Employee-specific items (shown only to EMPLOYEE role)
export const EMPLOYEE_ITEMS: NavItem[] = [
  {
    label: "Clock",
    href: (t) => `/${t}/clock`,
    icon: ShieldCheck,
    roles: ["EMPLOYEE"],
  },
  {
    label: "My documents",
    href: (t) => `/${t}/my-documents`,
    icon: IdCard,
    roles: ["EMPLOYEE"],
  },
];
