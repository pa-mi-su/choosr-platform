export type SwipeDirection = 'left' | 'right';

export type DecisionMode = 'eat' | 'do' | 'custom';

export type DecisionItem = {
  id: string;
  mode: DecisionMode;
  title: string;
  kicker: string;
  meta: string;
  description: string;
  background: string;
  accent: string;
  tags: string[];
  imageUrl?: string;
  action?: {
    label: string;
    url: string;
  };
};

export type DecisionModeDefinition = {
  id: DecisionMode;
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  prompt: string;
  matchSubtitle: string;
};
