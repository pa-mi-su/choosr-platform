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
export type DecisionMode = 'eat' | 'do' | 'custom';

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

type RankingSubmissionRow = {
  session_id: string;
  participant_id: string;
  round: number;
  created_at: string;
};

type ChoiceRankingRow = {
  session_id: string;
  participant_id: string;
  round: number;
  item_id: string;
  rank: number;
  created_at: string;
};

type MatchRow = {
  id: string;
  session_id: string;
  round: number;
  item_id: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  handle: string;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

type ConnectionRow = {
  id: string;
  requester_user_id: string;
  addressee_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'removed';
  created_at: string;
  responded_at: string | null;
  removed_at: string | null;
};

type RoomInvitationRow = {
  id: string;
  session_id: string;
  connection_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string;
  responded_at: string | null;
};

type UserNotificationRow = {
  id: number;
  recipient_user_id: string;
  kind: 'connection_request' | 'room_invitation';
  title: string;
  body: string;
  payload: Json;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
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
      ranking_submissions: Table<RankingSubmissionRow, never, never>;
      choice_rankings: Table<ChoiceRankingRow, never, never>;
      profiles: Table<ProfileRow, never, never>;
      connections: Table<ConnectionRow, never, never>;
      room_invitations: Table<RoomInvitationRow, never, never>;
      user_notifications: Table<UserNotificationRow, never, never>;
    };
    Views: Record<never, never>;
    Functions: {
      cancel_session: {
        Args: { p_session_id: string };
        Returns: undefined;
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
      upsert_choosr_profile: {
        Args: { p_display_name: string; p_handle: string };
        Returns: {
          user_id: string;
          display_name: string;
          handle: string;
        }[];
      };
      get_choosr_profile: {
        Args: Record<never, never>;
        Returns: {
          user_id: string;
          display_name: string;
          handle: string;
          avatar_path: string | null;
        }[];
      };
      set_profile_avatar: {
        Args: { p_avatar_path: string | null };
        Returns: undefined;
      };
      send_connection_request: {
        Args: { p_handle: string };
        Returns: string;
      };
      respond_connection: {
        Args: { p_connection_id: string; p_accept: boolean };
        Returns: undefined;
      };
      remove_circle_connection: {
        Args: { p_connection_id: string };
        Returns: undefined;
      };
      create_circle_invite: {
        Args: Record<never, never>;
        Returns: { invite_token: string; expires_at: string }[];
      };
      redeem_circle_invite: {
        Args: { p_invite_token: string };
        Returns: string;
      };
      list_circle: {
        Args: Record<never, never>;
        Returns: {
          connection_id: string;
          person_user_id: string;
          display_name: string;
          handle: string;
          avatar_path: string | null;
          status: 'pending' | 'accepted' | 'declined';
          direction: 'incoming' | 'outgoing';
        }[];
      };
      invite_connection_to_session: {
        Args: { p_session_id: string; p_connection_id: string };
        Returns: string;
      };
      list_pending_room_invitations: {
        Args: Record<never, never>;
        Returns: {
          invitation_id: string;
          session_id: string;
          sender_display_name: string;
          sender_handle: string;
          mode: DecisionMode;
          expires_at: string;
        }[];
      };
      respond_room_invitation: {
        Args: { p_invitation_id: string; p_accept: boolean };
        Returns: {
          session_id: string;
          status: SessionStatus;
          round_number: number;
          expires_at: string;
        }[];
      };
      register_push_token: {
        Args: { p_platform: 'ios' | 'android'; p_token: string };
        Returns: undefined;
      };
      unread_notification_count: {
        Args: Record<never, never>;
        Returns: number;
      };
      mark_notifications_read: {
        Args: { p_notification_ids?: number[] | null };
        Returns: number;
      };
      delete_notifications: {
        Args: { p_notification_ids?: number[] | null };
        Returns: number;
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
          outcome: 'next' | 'rank' | 'match' | 'no-match';
          match_id: string | null;
          matched_item_id: string | null;
        }[];
      };
      submit_rankings: {
        Args: {
          p_session_id: string;
          p_round: number;
          p_item_ids: string[];
        };
        Returns: {
          outcome: 'waiting' | 'match' | 'no-match';
          match_id: string | null;
          matched_item_id: string | null;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
