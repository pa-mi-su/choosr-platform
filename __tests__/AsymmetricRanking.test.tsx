import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockLoadDecisionDeck = jest.fn();
const mockLoadOwnRankingContext = jest.fn();
const mockLoadRoomOutcome = jest.fn();
const mockSubmitDecisionRankings = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect]);
    },
  };
});
jest.mock('../src/hooks/useRoomSync', () => ({
  useRoomSync: jest.fn(),
}));
jest.mock('../src/services/sessionService', () => ({
  cancelDecisionRoom: jest.fn(),
  loadDecisionDeck: (...args: unknown[]) => mockLoadDecisionDeck(...args),
  loadOwnRankingContext: (...args: unknown[]) =>
    mockLoadOwnRankingContext(...args),
  loadRoomOutcome: (...args: unknown[]) => mockLoadRoomOutcome(...args),
  submitDecisionRankings: (...args: unknown[]) =>
    mockSubmitDecisionRankings(...args),
}));

import { RankChoicesScreen } from '../src/screens/RankChoicesScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};
const deck = [
  {
    id: 'one',
    mode: 'watch',
    title: 'One',
    kicker: 'FILM',
    meta: '2026',
    description: 'First',
    background: '#20344A',
    accent: '#F0B7A4',
    tags: ['Drama'],
  },
  {
    id: 'two',
    mode: 'watch',
    title: 'Two',
    kicker: 'FILM',
    meta: '2026',
    description: 'Second',
    background: '#39464C',
    accent: '#E9D9BE',
    tags: ['Comedy'],
  },
];

test('a participant with one Yes auto-submits only that choice', async () => {
  jest.clearAllMocks();
  mockLoadDecisionDeck.mockResolvedValue(deck);
  mockLoadOwnRankingContext.mockResolvedValue({
    acceptedItemIds: ['one'],
    rankedItemIds: [],
    requiredRankCount: 1,
    submitted: false,
  });
  mockLoadRoomOutcome.mockResolvedValue({
    status: 'active',
    roundNumber: 1,
    matchedItemId: null,
  });
  mockSubmitDecisionRankings.mockResolvedValue({
    outcome: 'waiting',
    match_id: null,
    matched_item_id: null,
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <RankChoicesScreen
          navigation={
            {
              replace: jest.fn(),
              popToTop: jest.fn(),
            } as never
          }
          route={
            {
              key: 'rank-one',
              name: 'RankChoices',
              params: {
                sessionId: '10000000-0000-4000-8000-000000000001',
                roundNumber: 1,
                mode: 'watch',
              },
            } as never
          }
        />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockSubmitDecisionRankings).toHaveBeenCalledTimes(1);
  expect(mockSubmitDecisionRankings).toHaveBeenCalledWith({
    sessionId: '10000000-0000-4000-8000-000000000001',
    round: 1,
    itemIds: ['one'],
  });
  expect(
    renderer.root.findAll(
      node => node.children.join('') === 'Waiting for your partner.',
    ),
  ).toHaveLength(1);
  expect(
    renderer.root.findAll(
      node => node.children.join('') === 'Rank your top choices.',
    ),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => renderer.unmount());
});
