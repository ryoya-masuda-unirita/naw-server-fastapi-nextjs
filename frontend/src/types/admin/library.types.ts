export interface LibraryItem {
  id: string;
  name: string;
  tags: string[];
  createdDate: Date;
  creator: string;
  contentType: 'document' | 'video' | 'image' | 'audio' | 'other';
  description?: string;
  fileSize?: number;
  fileUrl?: string;
  thumbnailUrl?: string;
  isPublic?: boolean;
  lastModifiedDate?: Date;
  version?: string;
}

export interface TagItem {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export interface LibraryFilter {
  user?: string;
  tag?: string;
  contentType?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface LibraryPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface LibraryTagRef {
  id: string;
  name: string;
}

export interface LibraryGroupRef {
  id: string;
  name: string;
}

export interface LibraryPageItem {
  id: string;
  title: string;
  userId: string;
  updatedAt: string;
  tags: LibraryTagRef[];
  sharedGroups: LibraryGroupRef[];
}

export interface LibraryListParams {
  page: number;
  size: number;
  title?: string;
  createdBy?: string;
  excludeCreatedBy?: string;
  tagIds?: string[];
  sortBy?: string;
  sortDir?: string;
}

export interface LibraryUpdatePayload {
  name: string;
  tags: string[];
  groups: string[];
}

export interface LibraryListResponse {
  data: LibraryItem[];
  total: number;
  page: number;
  pageSize: number;
}
