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
    message: `Join my Choosr room to ${input.decisionPrompt}.\n\nTap to join: ${url}\n\nOr open Choosr and enter code: ${input.accessCode}`,
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
      `${input.displayName} invited you to join their Choosr Circle.\n\n` +
      `Connect and start choosing together:\n${url}`,
  };
}
