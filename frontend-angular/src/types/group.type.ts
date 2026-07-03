export interface Group {
  id: string;
  name: string;
  description?: string;
  type: GroupType;
  model: GroupModel;
  memberCount: number;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  isActive: boolean;
}

export type GroupType = 'チーム' | 'プロジェクト' | '部門' | 'カスタム';

export type GroupModel = 'GPT-4' | 'GPT-4o' | 'GPT-4o-mini' | 'Claude 3.5' | 'Gemini Pro';

export interface GroupFormData {
  name: string;
  description?: string;
  type: GroupType;
  model: GroupModel;
}

export interface GroupFilters {
  search: string;
  type: GroupType | 'all';
  isActive: boolean | 'all';
}
