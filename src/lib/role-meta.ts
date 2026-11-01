// Role names, labels and home pages. No server imports, so client components can use it.
export type Role = "FARMER" | "SUPERVISOR" | "HEAD";

export const ROLE_HOME: Record<Role, string> = {
  FARMER: "/farmer",
  SUPERVISOR: "/supervisor",
  HEAD: "/head-supervisor"
};

export const ROLE_LABEL: Record<Role, string> = {
  FARMER: "الإقرار الذاتي لمربّي المواشي",
  SUPERVISOR: "بوابة المفتشين الميدانيين",
  HEAD: "بوابة رئيس المفتشين"
};

export const CIVIL_ID_PATTERN = /^\d{12}$/;
