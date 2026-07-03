import type { SelectOption } from '@app-types/common';

export const satisfactionOptions = (allResponsesLabel: string): SelectOption[] => [
  { value: 'all', label: allResponsesLabel },
  { value: 'star1', label: '★☆☆☆☆' },
  { value: 'star2', label: '★★☆☆☆' },
  { value: 'star3', label: '★★★☆☆' },
  { value: 'star4', label: '★★★★☆' },
  { value: 'star5', label: '★★★★★' },
];
