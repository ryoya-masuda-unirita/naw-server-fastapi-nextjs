import { inject, Injectable, signal } from '@angular/core';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ShareAccessResponse, ShareResponse } from '@app-types/chat/share-api.type';
import { RoomsService } from './rooms.service';

export type { ShareAccessResponse, ShareResponse };

@Injectable({
  providedIn: 'root',
})
export class SharesService {
  private readonly roomsService = inject(RoomsService);
  private readonly api = inject(ApiClientService);

  readonly shareId = signal<string | null>(null);
  readonly isSharing = signal<boolean>(false);
  readonly isUnsharing = signal<boolean>(false);
  readonly isResolvingAccess = signal<boolean>(false);

  async shareRoom(roomId: string, teamIds: string[]): Promise<ShareResponse> {
    this.isSharing.set(true);
    try {
      const data = await this.api.post<{ data: ShareResponse }>(API_PATHS.SHARES.CREATE, {
        roomId,
        teamIds,
      });
      this.shareId.set(data.data.id);
      this.roomsService.updateRoom(roomId, { shareId: data.data.id, teamIds: data.data.teamIds });
      return data.data;
    } finally {
      this.isSharing.set(false);
    }
  }

  async unshareRoom(shareId: string): Promise<void> {
    this.isUnsharing.set(true);
    try {
      await this.api.delete(API_PATHS.SHARES.DELETE(shareId));
      const roomId = this.findRoomIdByShareId(shareId);
      this.shareId.set(null);
      if (roomId) {
        this.roomsService.updateRoom(roomId, { shareId: null, teamIds: [] });
      }
    } finally {
      this.isUnsharing.set(false);
    }
  }

  async resolveShareAccess(shareId: string): Promise<ShareAccessResponse> {
    this.isResolvingAccess.set(true);
    try {
      const data = await this.api.get<{ data: ShareAccessResponse }>(
        API_PATHS.SHARES.ACCESS(shareId),
      );
      return data.data;
    } finally {
      this.isResolvingAccess.set(false);
    }
  }

  private findRoomIdByShareId(shareId: string): string | null {
    return this.roomsService.allRooms().find((r) => r.shareId === shareId)?.id ?? null;
  }
}
