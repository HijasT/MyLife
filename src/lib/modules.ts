import type { Module } from "@/types";

export const MODULES: Module[] = [
  { id:"duetracker",      label:"Due Tracker",    icon:"📋", href:"/dashboard/duetracker",      group:"finance",   status:"active",      description:"Monthly dues & payments",    color:"#1D9E75" },
  { id:"portfolio",   label:"Portfolio",      icon:"📈", href:"/dashboard/portfolio",   group:"finance",   status:"active",      description:"Stocks, gold & metals",      color:"#378ADD" },
  { id:"calendar",    label:"Calendar",       icon:"🗓️",  href:"/dashboard/calendar",    group:"lifestyle", status:"active",      description:"Work hours & life log",      color:"#6366f1" },
  { id:"biomarkers",  label:"BioMarkers",     icon:"🧬", href:"/dashboard/biomarkers",  group:"lifestyle", status:"active",      description:"Lab results & body metrics", color:"#10b981" },
  { id:"aromatica",   label:"Aromatica",      icon:"🌸", href:"/dashboard/aromatica",   group:"lifestyle", status:"active",      description:"Fragrance collection · Bottles · Wear logs", color:"#D85A30" },
];

export const FINANCE_MODULES   = MODULES.filter(m => m.group === "finance");
export const LIFESTYLE_MODULES = MODULES.filter(m => m.group === "lifestyle");
