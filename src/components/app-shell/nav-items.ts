import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Calendar,
  CalendarRange,
  Clock,
  Users,
  DollarSign,
  FileText,
  CheckSquare,
  Settings,
  PlaneTakeoff,
  ShieldCheck,
  IdCard,
  LayoutTemplate,
  ArrowLeftRight,
  UserCheck,
  CalendarCheck,
  User,
  MapPin,
  ClipboardList,
} from "lucide-react";

export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

export type NavItem = {
  label: string;
  href: (tenant: string) => string;
  icon: LucideIcon;
  roles: Role[];
  matchPrefix?: (tenant: string) => string;
};

// =============================================================
// Admin & Manager navigation
// Routes verified against the build's actual page tree.
// =============================================================
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
    label: "Templates",
    href: (t) => `/${t}/templates`,
    icon: LayoutTemplate,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Calendar",
    href: (t) => `/${t}/calendar`,
    icon: CalendarRange,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Timesheets",
    href: (t) => `/${t}/timesheets`,
    icon: Clock,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => `/${t}/timesheets`,
  },
  {
    label: "Approvals",
    href: (t) => `/${t}/timesheets/approvals`,
    icon: CheckSquare,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Attendance",
    href: (t) => `/${t}/attendance`,
    icon: UserCheck,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Employees",
    href: (t) => `/${t}/employees`,
    icon: Users,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => `/${t}/employees`,
  },
  {
    label: "Time off",
    href: (t) => `/${t}/time-off`,
    icon: PlaneTakeoff,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Swaps",
    href: (t) => `/${t}/swaps`,
    icon: ArrowLeftRight,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Documents",
    href: (t) => `/${t}/documents`,
    icon: FileText,
    roles: ["ADMIN", "MANAGER"],
    matchPrefix: (t) => `/${t}/documents`,
  },
  {
    label: "Payroll",
    href: (t) => `/${t}/payroll`,
    icon: DollarSign,
    roles: ["ADMIN"],
    matchPrefix: (t) => `/${t}/payroll`,
  },
  {
    label: "Locations",
    href: (t) => `/${t}/locations`,
    icon: MapPin,
    roles: ["ADMIN"],
    matchPrefix: (t) => `/${t}/locations`,
  },
  {
    label: "Settings",
    href: (t) => `/${t}/settings`,
    icon: Settings,
    roles: ["ADMIN"],
    matchPrefix: (t) => `/${t}/settings`,
  },
];

// =============================================================
// Employee navigation
// =============================================================
export const EMPLOYEE_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: (t) => `/${t}/dashboard`,
    icon: LayoutDashboard,
    roles: ["EMPLOYEE"],
  },
  {
    label: "My shifts",
    href: (t) => `/${t}/my-shifts`,
    icon: CalendarCheck,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Clock",
    href: (t) => `/${t}/clock`,
    icon: ShieldCheck,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Availability",
    href: (t) => `/${t}/availability`,
    icon: ClipboardList,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Swaps",
    href: (t) => `/${t}/swaps`,
    icon: ArrowLeftRight,
    roles: ["EMPLOYEE"],
  },
  {
    label: "My attendance",
    href: (t) => `/${t}/my-attendance`,
    icon: UserCheck,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Time off",
    href: (t) => `/${t}/time-off`,
    icon: PlaneTakeoff,
    roles: ["EMPLOYEE"],
  },
  {
    label: "My documents",
    href: (t) => `/${t}/my-documents`,
    icon: IdCard,
    roles: ["EMPLOYEE"],
  },
  {
    label: "Profile",
    href: (t) => `/${t}/profile`,
    icon: User,
    roles: ["EMPLOYEE"],
  },
];
