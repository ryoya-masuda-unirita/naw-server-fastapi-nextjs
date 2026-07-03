export interface LearningDataFile {
  id: string;
  fileName: string;
  displayName: string;
  link: string;
  updatedAt: string;
  updatedBy: string;
  status: 'active' | 'inactive';
  selected?: boolean;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
}

export type IndexType = 'cloud' | 'local';
