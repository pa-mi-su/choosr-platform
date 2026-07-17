export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SessionStatus =
  | 'waiting'
  | 'active'
  | 'matched'
  | 'completed'
  | 'expired'
  | 'cancelled';

export type ParticipantRole = 'host' | 'partner';
export type SwipeDirection = 'left' | 'right';
export type DecisionMode = 'watch' | 'eat' | 'do';

type SessionRow = {
  id: string;
  access_code: string;
  invite_token_hash: string;
  host_user_id: string;
  mode: DecisionMode;
  status: SessionStatus;
  region: string;
  round_number: number;
  created_at: string;
  expires_at: string;
  matched_at: string | null;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  auth_user_id: string;
  role: ParticipantRole;
  joined_at: string;
  last_seen_at: string;
};

type SessionItemRow = {
  id: number;
  session_id: string;
  round: number;
  item_id: string;
  item_payload: Json;
  position: number;
  created_at: string;
};

type SwipeRow = {
  id: number;
  session_id: string;
  participant_id: string;
  round: number;
  item_id: string;
  direction: SwipeDirection;
  created_at: string;
};

type MatchRow = {
  id: string;
  session_id: string;
  round: number;
  item_id: string;
  created_at: string;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      sessions: Table<SessionRow, never, never>;
      participants: Table<ParticipantRow, never, never>;
      session_items: Table<SessionItemRow, never, never>;
      swipes: Table<SwipeRow, never, never>;
      matches: Table<MatchRow, never, never>;
    };
    Views: Record<never, never>;
    Functions: {
      cancel_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      create_session: {
        Args: { p_region?: string; p_item_ids: string[] };
        Returns: {
          session_id: string;
          access_code: string;
          invite_token: string;
          expires_at: string;
        }[];
      };
      create_decision_session: {
        Args: {
          p_mode: DecisionMode;
          p_items: Json;
          p_region?: string;
        };
        Returns: {
          session_id: string;
          access_code: string;
          invite_token: string;
          expires_at: string;
        }[];
      };
      join_session: {
        Args: {
          p_access_code?: string | null;
          p_invite_token?: string | null;
        };
        Returns: {
          session_id: string;
          status: SessionStatus;
          round_number: number;
          expires_at: string;
        }[];
      };
      start_new_round: {
        Args: { p_session_id: string; p_item_ids: string[] };
        Returns: number;
      };
      start_decision_round: {
        Args: { p_session_id: string; p_items: Json };
        Returns: number;
      };
      touch_presence: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      submit_swipe: {
        Args: {
          p_session_id: string;
          p_round: number;
          p_item_id: string;
          p_direction: SwipeDirection;
        };
        Returns: {
          outcome: 'next' | 'waiting' | 'match' | 'no-match';
          match_id: string | null;
          matched_item_id: string | null;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
