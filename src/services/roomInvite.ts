const CHOOSR_DEEP_LINK_PREFIX = 'choosr://';

export type RoomInvite = {
  url: string;
  message: string;
};

export type CircleInvite = RoomInvite;

export function buildNativeSharePayload(
  title: string,
  content: Pick<RoomInvite, 'message'>,
) {
  // Supplying the same link through both `message` and iOS's `url` field
  // renders two separate raw-link bubbles in Messages. Keep one complete,
  // cross-platform message so the invitation is branded and appears once.
  return { title, message: content.message };
}

export function buildRoomInvite(input: {
  inviteToken: string;
  accessCode: string;
  decisionPrompt: string;
}): RoomInvite {
  const url = `${CHOOSR_DEEP_LINK_PREFIX}join/${encodeURIComponent(
    input.inviteToken,
  )}`;

  return {
    url,
    message:
      `CHOOSR · ROOM INVITATION\n\n` +
      `Let's ${input.decisionPrompt}.\n\n` +
      `Open the room:\n${url}\n\n` +
      `Or enter room code: ${input.accessCode}`,
  };
}

export const roomLinkingPrefixes = [CHOOSR_DEEP_LINK_PREFIX];

export function buildCircleInvite(input: {
  inviteToken: string;
  displayName: string;
}): CircleInvite {
  const url = `${CHOOSR_DEEP_LINK_PREFIX}connect/${encodeURIComponent(
    input.inviteToken,
  )}`;
  return {
    url,
    message:
      `CHOOSR · CIRCLE INVITATION\n\n` +
      `${input.displayName} wants to connect with you.\n\n` +
      `Join their Choosr Circle and start choosing together:\n${url}`,
  };
}
