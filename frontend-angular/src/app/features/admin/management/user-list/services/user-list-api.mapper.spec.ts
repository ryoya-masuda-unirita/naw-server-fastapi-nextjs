import { describe, expect, it } from 'vitest';
import { mapUserListResponse } from './user-list-api.mapper';

describe('mapUserListResponse', () => {
  it('maps contents/totalCount and name field', () => {
    const result = mapUserListResponse({
      contents: [
        {
          id: 'user-uuid',
          userId: 'user-uuid',
          name: '山田 太郎',
          role: 'USER',
          email: 'a@example.com',
        },
      ],
      totalCount: 1,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].displayName).toBe('山田 太郎');
    expect(result.data[0].id).toBe('user-uuid');
  });
});
