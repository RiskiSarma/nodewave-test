import { useAuth } from '@/stores/auth';
import { expect, test } from 'vitest';
test('hydrated flag', () => {
  expect(useAuth.getState().hydrated).toBe(true);
});
