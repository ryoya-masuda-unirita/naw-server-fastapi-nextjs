import { inject, Injectable, signal } from '@angular/core';
import type { SelectOption } from '@app-types/common';
import { TrainingApiService } from './training-api.service';
import {
  resolveInitialEndpointId,
  resolveSaasGlobalEndpointIds,
  SAAS_GLOBAL_ENDPOINT_TYPES,
  toEndpointSelectOptions,
  type TrainingFolderType,
} from '../utils/training-folder-form.helper';

@Injectable({ providedIn: 'root' })
export class TrainingFolderModalService {
  private readonly api = inject(TrainingApiService);

  readonly isLoading = signal(false);
  readonly endpointOptions = signal<SelectOption[]>([]);
  readonly hasNoEndpoints = signal(false);
  readonly selectedEndpointIds = signal<string[]>([]);

  private groupIds: string[] = [];

  reset(): void {
    this.isLoading.set(false);
    this.endpointOptions.set([]);
    this.hasNoEndpoints.set(false);
    this.selectedEndpointIds.set([]);
    this.groupIds = [];
  }

  getGroupIds(): string[] {
    return [...this.groupIds];
  }

  async initializeGroups(): Promise<void> {
    this.isLoading.set(true);
    try {
      this.groupIds = await this.api.listAllGroupIds();
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadEndpointsForType(
    folderType: TrainingFolderType,
    existingEndpointIds?: string[],
  ): Promise<string | null> {
    this.isLoading.set(true);
    try {
      if (folderType === 'SAAS_GLOBAL') {
        const [vdbEndpoints, embeddingEndpoints] = await Promise.all(
          SAAS_GLOBAL_ENDPOINT_TYPES.map((type) => this.api.listEndpointsByType(type)),
        );
        const endpointIds = resolveSaasGlobalEndpointIds(
          toEndpointSelectOptions(vdbEndpoints),
          toEndpointSelectOptions(embeddingEndpoints),
          existingEndpointIds,
        );
        this.endpointOptions.set([]);
        this.selectedEndpointIds.set(endpointIds ?? []);
        this.hasNoEndpoints.set(!endpointIds);
        return null;
      }

      const endpoints = await this.api.listEndpointsByType('LOCAL_SERVER');
      const options = toEndpointSelectOptions(endpoints);
      const localEndpointId = resolveInitialEndpointId(options, existingEndpointIds?.[0]);
      this.endpointOptions.set(options);
      this.selectedEndpointIds.set(localEndpointId ? [localEndpointId] : []);
      this.hasNoEndpoints.set(options.length === 0);
      return localEndpointId;
    } finally {
      this.isLoading.set(false);
    }
  }
}
