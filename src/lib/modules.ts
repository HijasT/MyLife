import type { Module } from "@/types";

export const MODULES: Module[] = [
  { id:"expenses", label:"Expenses", icon:"💳", href:"/dashboard/expenses", group:"finance", status:"coming-soon", description:"Track daily spending", color:"#F5A623" },
  { id:"budget", label:"Budget", icon:"📊", href:"/dashboard/budget", group:"finance", status:"coming-soon", description:"Monthly limits & goals", color:"#1D9E75" },
  { id:"portfolio", label:"Portfolio", icon:"📈", href:"/dashboard/portfolio", group:"finance", status:"coming-soon", description:"Stocks, gold & metals", color:"#378ADD" },
  { id:"perfumes", label:"Perfumes", icon:"🌸", href:"/dashboard/perfumes", group:"lifestyle", status:"active", description:"Collection tracker", color:"#D85A30" },
  { id:"expiry", label:"Expiry Tracker", icon:"📅", href:"/dashboard/expiry", group:"lifestyle", status:"coming-soon", description:"Product expiry dates", color:"#8B5CF6" },
];

export const FINANCE_MODULES = MODULES.filter((m) => m.group === "finance");
export const LIFESTYLE_MODULES = MODULES.filter((m) => m.group === "lifestyle");
