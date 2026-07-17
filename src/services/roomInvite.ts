const CHOOSR_DEEP_LINK_PREFIX = 'choosr://';

export type RoomInvite = {
  url: string;
  message: string;
};

export type CircleInvite = RoomInvite;

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
    message: `${input.displayName} invited you to connect on Choosr. Tap to join their Circle: ${url}`,
  };
}
