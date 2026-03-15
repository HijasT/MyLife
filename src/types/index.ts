export type ModuleId = "dashboard"|"expenses"|"budget"|"portfolio"|"perfumes"|"calendar"|"biomarkers"|"expiry";
export type ModuleStatus = "active"|"coming-soon";

export interface Module {
  id: ModuleId; label: string; icon: string; href: string;
  group: "finance"|"lifestyle"; status: ModuleStatus;
  description: string; color: string;
}

export interface User { id: string; email: string; full_name?: string; avatar_url?: string; }
