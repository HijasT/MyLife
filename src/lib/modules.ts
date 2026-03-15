import type { Module } from "@/types";

export const MODULES: Module[] = [
  { id:"expenses",    label:"Expenses",       icon:"💳", href:"/dashboard/expenses",    group:"finance",   status:"coming-soon", description:"Track daily spending",       color:"#F5A623" },
  { id:"budget",      label:"Due Tracker",    icon:"📋", href:"/dashboard/budget",      group:"finance",   status:"active",      description:"Monthly dues & payments",    color:"#1D9E75" },
  { id:"portfolio",   label:"Portfolio",      icon:"📈", href:"/dashboard/portfolio",   group:"finance",   status:"active",      description:"Stocks, gold & metals",      color:"#378ADD" },
  { id:"perfumes",    label:"Aromatica",      icon:"🌸", href:"/dashboard/perfumes",    group:"lifestyle", status:"active",      description:"Fragrance collection",       color:"#D85A30" },
  { id:"calendar",    label:"Calendar",       icon:"🗓️",  href:"/dashboard/calendar",    group:"lifestyle", status:"active",      description:"Work hours & life log",      color:"#6366f1" },
  { id:"biomarkers",  label:"BioMarkers",     icon:"🧬", href:"/dashboard/biomarkers",  group:"lifestyle", status:"active",      description:"Lab results & body metrics", color:"#10b981" },
  { id:"expiry",      label:"Expiry Tracker", icon:"📅", href:"/dashboard/expiry",      group:"lifestyle", status:"coming-soon", description:"Product expiry dates",       color:"#8B5CF6" },
];

export const FINANCE_MODULES   = MODULES.filter(m => m.group === "finance");
export const LIFESTYLE_MODULES = MODULES.filter(m => m.group === "lifestyle");
