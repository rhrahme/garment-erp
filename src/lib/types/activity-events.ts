import type { ActivityTeam } from "@/lib/activity/team";

export type ActivityEvent = {
  id: string;
  at: string;
  action: string;
  summary: string;
  actor_email: string | null;
  actor_name: string;
  team: ActivityTeam;
  so_number: string | null;
  order_id: string | null;
  client_name: string | null;
};

export type ActivityEventsFile = {
  updated_at: string | null;
  events: ActivityEvent[];
};
