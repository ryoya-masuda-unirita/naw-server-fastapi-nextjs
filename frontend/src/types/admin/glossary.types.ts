export interface GlossaryItem {
  id: string;
  name: string;
  definition: string;
  tags: string[];
  editedDate: Date;
  creator: string;
  category?: string;
  relatedTerms?: string[];
  isPublic?: boolean;
  lastModifiedBy?: string;
  version?: string;
  assistant?: string;
}

export interface GlossaryFilter {
  search?: string;
  category?: string;
  tag?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface GlossaryPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface GlossaryTagItem {
  id: string;
  name: string;
  description?: string;
  updatedDate: Date;
  updatedBy: string;
}
