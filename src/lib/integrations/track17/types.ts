export type Track17Address = {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  street?: string | null;
  postal_code?: string | null;
};

export type Track17Event = {
  time_iso?: string | null;
  time_utc?: string | null;
  description?: string | null;
  location?: string | null;
  address?: Track17Address | null;
};

export type Track17TrackInfo = {
  latest_status?: {
    status?: string | null;
    sub_status?: string | null;
  } | null;
  latest_event?: Track17Event | null;
  time_metrics?: {
    estimated_delivery_date?: {
      to?: string | null;
      from?: string | null;
    } | null;
  } | null;
  milestone?: Array<{
    key_stage?: string | null;
    time_utc?: string | null;
  }> | null;
};

export type Track17TrackingPayload = {
  number: string;
  carrier?: number;
  tag?: string | null;
  track_info?: Track17TrackInfo | null;
};

export type Track17WebhookBody = {
  event: "TRACKING_UPDATED" | "TRACKING_STOPPED" | string;
  data: Track17TrackingPayload;
};

export type Track17ApiResponse<T> = {
  code: number;
  data?: T;
  message?: string;
};

export type Track17RegisterResult = {
  accepted?: Track17TrackingPayload[];
  rejected?: Array<{
    number: string;
    carrier?: number;
    error?: { code?: number; message?: string };
  }>;
};

export type Track17TrackInfoResult = {
  accepted?: Track17TrackingPayload[];
  rejected?: Array<{
    number: string;
    carrier?: number;
    error?: { code?: number; message?: string };
  }>;
};
