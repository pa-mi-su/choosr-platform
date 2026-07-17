const CHOOSR_DEEP_LINK_PREFIX = 'choosr://';

export type RoomInvite = {
  url: string;
  message: string;
};

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
