export type LoginEventOutcome = "success" | "failure";
export type LoginEventMethod = "email" | "badge";

export type LoginEvent = {
  id: string;
  at: string;
  outcome: LoginEventOutcome;
  method: LoginEventMethod;
  /** Human label: email or "Mohtajul (2625917972)". */
  actor: string;
  /** What they typed: email or badge number. */
  identifier: string;
  ip: string;
  device: string;
  user_agent: string;
  error: string | null;
};

export type LoginEventsFile = {
  updated_at: string | null;
  events: LoginEvent[];
};
