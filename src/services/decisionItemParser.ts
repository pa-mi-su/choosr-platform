import type { DecisionItem, DecisionMode } from '../types/domain';

const modes = new Set<DecisionMode>(['eat', 'do', 'custom']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (
  value: unknown,
  field: string,
  maxLength: number,
): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid decision item field: ${field}.`);
  }
  return value;
};

const color = (value: unknown, field: string): string => {
  const parsed = requiredString(value, field, 7);
  if (!/^#[0-9A-Fa-f]{6}$/.test(parsed)) {
    throw new Error(`Invalid decision item field: ${field}.`);
  }
  return parsed;
};

export function parseDecisionItem(value: unknown): DecisionItem {
  if (!isRecord(value)) {
    throw new Error('Decision item must be an object.');
  }
  const mode = value.mode;
  if (typeof mode !== 'string' || !modes.has(mode as DecisionMode)) {
    throw new Error('Invalid decision item field: mode.');
  }
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 12 ||
    !value.tags.every(tag => typeof tag === 'string' && tag.length <= 40)
  ) {
    throw new Error('Invalid decision item field: tags.');
  }

  let action: DecisionItem['action'];
  let imageUrl: string | undefined;
  if (value.imageUrl !== undefined) {
    imageUrl = requiredString(value.imageUrl, 'imageUrl', 4096);
    if (!imageUrl.startsWith('https://')) {
      throw new Error('Decision item image must use HTTPS.');
    }
  }
  if (value.action !== undefined) {
    if (!isRecord(value.action)) {
      throw new Error('Invalid decision item field: action.');
    }
    const url = requiredString(value.action.url, 'action.url', 2048);
    if (!url.startsWith('https://')) {
      throw new Error('Decision item action must use HTTPS.');
    }
    action = {
      label: requiredString(value.action.label, 'action.label', 120),
      url,
    };
  }

  return {
    id: requiredString(value.id, 'id', 200),
    mode: mode as DecisionMode,
    title: requiredString(value.title, 'title', 160),
    kicker: requiredString(value.kicker, 'kicker', 80),
    meta: requiredString(value.meta, 'meta', 240),
    description: requiredString(value.description, 'description', 2000),
    background: color(value.background, 'background'),
    accent: color(value.accent, 'accent'),
    tags: value.tags,
    ...(imageUrl ? { imageUrl } : {}),
    ...(action ? { action } : {}),
  };
}
