import type { CuisineFilter } from '../data/cuisines';

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
  completed_at: string | null;
  cuisine_filter: CuisineFilter;
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

type SessionLocationRow = {
  session_id: string;
  participant_id: string;
  latitude: number;
  longitude: number;
  location_label: string;
  submitted_at: string;
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

type RoomCompletionAcknowledgementRow = {
  session_id: string;
  participant_id: string;
  round: number;
  acknowledged_at: string;
};

type RoomHistoryDismissalRow = {
  session_id: string;
  participant_id: string;
  round: number;
  dismissed_at: string;
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
  kind: 'connection_request' | 'room_invitation' | 'chat_invitation';
  title: string;
  body: string;
  payload: Json;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
};

type ChatRoomRow = {
  id: string;
  status: 'inviting' | 'active' | 'destroyed' | 'expired';
  created_at: string;
  activated_at: string | null;
  expires_at: string;
  destroyed_at: string | null;
  destruction_reason: 'participant' | 'expired' | null;
};

type ChatParticipantRow = {
  room_id: string;
  user_id: string;
  role: 'creator' | 'joiner';
  public_key: string;
  joined_at: string;
};

type ChatMessageRow = {
  id: number;
  room_id: string;
  sender_user_id: string;
  client_message_id: string;
  nonce: string;
  ciphertext: string;
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
      session_locations: Table<SessionLocationRow, never, never>;
      swipes: Table<SwipeRow, never, never>;
      matches: Table<MatchRow, never, never>;
      room_completion_acknowledgements: Table<
        RoomCompletionAcknowledgementRow,
        never,
        never
      >;
      room_history_dismissals: Table<RoomHistoryDismissalRow, never, never>;
      ranking_submissions: Table<RankingSubmissionRow, never, never>;
      choice_rankings: Table<ChoiceRankingRow, never, never>;
      profiles: Table<ProfileRow, never, never>;
      connections: Table<ConnectionRow, never, never>;
      room_invitations: Table<RoomInvitationRow, never, never>;
      user_notifications: Table<UserNotificationRow, never, never>;
      chat_rooms: Table<ChatRoomRow, never, never>;
      chat_participants: Table<ChatParticipantRow, never, never>;
      chat_messages: Table<ChatMessageRow, never, never>;
    };
    Views: Record<never, never>;
    Functions: {
      acknowledge_room_completion: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
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
      create_location_decision_session: {
        Args: {
          p_mode: 'eat' | 'do';
          p_latitude: number;
          p_longitude: number;
          p_location_label: string;
          p_cuisine_filter?: CuisineFilter;
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
      list_active_room_history: {
        Args: Record<never, never>;
        Returns: {
          session_id: string;
          access_code: string;
          mode: DecisionMode;
          status: SessionStatus;
          round_number: number;
          expires_at: string;
          created_at: string;
          participant_count: number;
          total_choices: number;
          completed_choices: number;
          matched_item_id: string | null;
          partner_display_name: string | null;
          partner_avatar_path: string | null;
          selection_complete: boolean;
          result_acknowledged: boolean;
        }[];
      };
      dismiss_completed_room: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      dismiss_all_completed_rooms: {
        Args: Record<never, never>;
        Returns: number;
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
      report_push_registration: {
        Args: {
          p_platform: 'ios' | 'android';
          p_status: 'ready' | 'unavailable';
          p_stage: string;
          p_code: string;
          p_app_version: string;
          p_build_number: string;
        };
        Returns: undefined;
      };
      push_token_status: {
        Args: { p_token: string };
        Returns: 'active' | 'invalidated' | 'missing';
      };
      has_registered_push_token: {
        Args: Record<never, never>;
        Returns: boolean;
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
      create_chat_invitation: {
        Args: { p_public_key: string };
        Returns: {
          room_id: string;
          invitation_token: string;
          invitation_expires_at: string;
          room_expires_at: string;
        }[];
      };
      join_chat_invitation: {
        Args: { p_invitation_token: string; p_public_key: string };
        Returns: {
          room_id: string;
          peer_public_key: string;
          room_expires_at: string;
        }[];
      };
      get_active_chat: {
        Args: Record<never, never>;
        Returns: {
          room_id: string;
          status: 'inviting' | 'active';
          role: 'creator' | 'joiner';
          own_public_key: string;
          peer_public_key: string | null;
          room_expires_at: string;
          decision_session_id: string | null;
        }[];
      };
      open_matched_room_chat: {
        Args: { p_session_id: string; p_public_key: string };
        Returns: {
          room_id: string;
          status: 'inviting' | 'active';
          role: 'creator' | 'joiner';
          own_public_key: string;
          peer_public_key: string | null;
          room_expires_at: string;
          decision_session_id: string;
        }[];
      };
      list_pending_matched_chat_invitations: {
        Args: Record<never, never>;
        Returns: {
          chat_room_id: string;
          decision_session_id: string;
          inviter_display_name: string;
          inviter_avatar_path: string | null;
          matched_item_title: string;
          created_at: string;
          expires_at: string;
        }[];
      };
      decline_matched_chat_invitation: {
        Args: { p_room_id: string };
        Returns: undefined;
      };
      send_chat_ciphertext: {
        Args: {
          p_room_id: string;
          p_client_message_id: string;
          p_nonce: string;
          p_ciphertext: string;
        };
        Returns: { message_id: number; created_at: string }[];
      };
      destroy_chat_room: {
        Args: { p_room_id: string };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
