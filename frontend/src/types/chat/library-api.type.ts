export interface LibraryTag {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryTagsResponse {
  tags: LibraryTag[];
}

export interface LibraryUpdateRequest {
  name: string;
  groups?: string[];
  tags?: string[];
}

export interface LibraryUpdateResponse {
  data: { id: string };
}
