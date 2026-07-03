import { computed, inject, Injectable, signal } from '@angular/core';
import { FileAttachment } from '@app-types/chat/file-attachment.type';
import { Message } from '@app-types/chat/message.type';
import { ChatRoom, RoomFeedbackRating, RoomPinUpdate } from '@app-types/chat/chat-room.type';
import { ShareAccessResponse } from '@app-types/chat/share-api.type';
import { RoomsService } from './rooms.service';
import { MessageService, SendMessageOptions } from './messages.service';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private _activeRoomId = signal<string | null>(null);
  private _attachedFiles = signal<FileAttachment[]>([]);
  private _sharedRoomContext = signal<ChatRoom | undefined>(undefined);

  private readonly roomsService = inject(RoomsService);
  private readonly messageService = inject(MessageService);

  // ─── Delegate room state ─────────────────────────────────
  readonly searchResults = this.roomsService.searchResults;
  readonly allRooms = this.roomsService.allRooms;
  readonly isSearchLoading = this.roomsService.isSearchLoading;
  readonly isAllRoomsLoading = this.roomsService.isAllRoomsLoading;
  readonly allRoomsHasMore = this.roomsService.allRoomsHasMore;
  readonly isCreatingRoom = this.roomsService.isCreatingRoom;
  readonly isRenamingRoom = this.roomsService.isRenamingRoom;
  readonly isDeletingRoom = this.roomsService.isDeletingRoom;
  readonly isReorderingRooms = this.roomsService.isReorderingRooms;
  readonly isSubmittingFeedback = this.roomsService.isSubmittingFeedback;
  pinnedRooms = this.roomsService.pinnedRooms;
  rooms = this.roomsService.rooms;

  // ─── Delegate message state ───────────────────────────────
  messages = this.messageService.visibleMessages;
  versionInfoByMessageId = this.messageService.versionInfoByMessageId;
  isLoading = this.messageService.isLoading;
  isGenerating = this.messageService.isGenerating;
  messagesLoadError = this.messageService.loadError;

  activeRoom = computed(() => {
    const roomId = this._activeRoomId();
    if (!roomId) {
      return undefined;
    }

    const fromList = this.roomsService.allRooms().find((room) => room.id === roomId);
    if (fromList) {
      return fromList;
    }

    return this._sharedRoomContext();
  });
  activeRoomId = this._activeRoomId.asReadonly();
  attachedFiles = this._attachedFiles.asReadonly();

  // ─── Room selection ───────────────────────────────────────
  selectRoom(roomId: string): void {
    this._activeRoomId.set(roomId);
    void this.messageService.loadMessagesForRoom(roomId);
  }

  setActiveRoomId(roomId: string): void {
    this._activeRoomId.set(roomId);
  }

  startNewChat(): void {
    this._activeRoomId.set(null);
    this._attachedFiles.set([]);
    this.messageService.clearMessages();
  }

  async loadMessagesForRoom(roomId: string, isInit?: boolean): Promise<void> {
    return this.messageService.loadMessagesForRoom(roomId, isInit);
  }

  async openSharedRoom(access: ShareAccessResponse, shareId: string): Promise<void> {
    const existingRoom = this.roomsService.allRooms().find((room) => room.id === access.roomId);

    if (existingRoom) {
      this._sharedRoomContext.set(undefined);
    } else {
      this._sharedRoomContext.set({
        id: access.roomId,
        name: access.roomName ?? '',
        isPinned: false,
        category: 'chat',
        shareId,
        teamIds: access.teamIds,
      });
    }

    this._activeRoomId.set(access.roomId);
    await this.messageService.loadMessagesForRoom(access.roomId, true);
  }

  clearSharedRoomContext(): void {
    this._sharedRoomContext.set(undefined);
  }

  openAdminHistoryRoom(params: {
    id: string;
    name: string;
    userId?: string;
    userName?: string;
  }): void {
    this._sharedRoomContext.set({
      id: params.id,
      name: params.name,
      isPinned: false,
      category: 'chat',
      userId: params.userId,
      userName: params.userName,
    });
    this._activeRoomId.set(params.id);
  }

  clearAdminHistoryRoomContext(): void {
    this._sharedRoomContext.set(undefined);
  }

  // ─── Message methods ──────────────────────────────────────
  async sendMessage(content: string, files?: File[], options?: SendMessageOptions): Promise<void> {
    const attachedFiles = this._attachedFiles();
    console.log('this.chatService.selectRoom(roomId);', this._activeRoomId());
    this._attachedFiles.set([]);
    await this.messageService.sendMessage(
      content,
      files,
      this._activeRoomId(),
      attachedFiles,
      options,
    );
  }

  async regenerateMessage(messageId: string): Promise<void> {
    return this.messageService.regenerateMessage(messageId);
  }

  async retryMessage(messageId: string): Promise<void> {
    return this.messageService.retryMessage(messageId);
  }

  async webSearchRetryMessage(messageId: string): Promise<void> {
    return this.messageService.webSearchRetryMessage(messageId);
  }

  async editMessage(messageId: string, newText: string): Promise<void> {
    return this.messageService.editMessage(messageId, newText, this._activeRoomId());
  }

  switchMessageVersion(groupKey: string, direction: 'prev' | 'next'): void {
    this.messageService.switchVersion(groupKey, direction);
  }

  getMessageVersionInfo(message: Message) {
    return this.messageService.getVersionInfo(message);
  }

  async deleteMessage(messageId: string): Promise<void> {
    return this.messageService.deleteMessage(messageId);
  }

  async rateMessage(messageId: string, rating: 'GOOD' | 'BAD'): Promise<void> {
    return this.messageService.rateMessage(messageId, rating);
  }

  // ─── Room methods (delegated) ─────────────────────────────
  async createNewRoom(assistantId: string): Promise<string | null> {
    const newRoomId = await this.roomsService.createNewRoom(assistantId);
    if (newRoomId) {
      this._activeRoomId.set(newRoomId);
    }
    return newRoomId;
  }

  async renameRoom(roomId: string, newName: string): Promise<void> {
    return this.roomsService.renameRoom(roomId, newName);
  }

  async togglePinRoom(room: { id: string; isPinned: boolean }): Promise<void> {
    return this.roomsService.togglePinRoom(room);
  }

  async bulkUpdateRoomPins(rooms: RoomPinUpdate[]): Promise<void> {
    return this.roomsService.bulkUpdateRoomPins(rooms);
  }

  async deleteRoom(roomId: string): Promise<void> {
    return this.roomsService.deleteRoom(roomId);
  }

  async saveRoomOrder(rooms: { id: string; isPinned: boolean; order: number }[]): Promise<void> {
    return this.roomsService.saveRoomOrder(rooms);
  }

  async deleteRooms(roomIds: string[]): Promise<void> {
    return this.roomsService.deleteRooms(roomIds);
  }

  async getAllRooms(): Promise<void> {
    return this.roomsService.getAllRooms();
  }

  async loadNextRoomsPage(): Promise<void> {
    return this.roomsService.loadNextRoomsPage();
  }

  async submitRoomFeedback(roomId: string, rating: RoomFeedbackRating): Promise<void> {
    return this.roomsService.submitRoomFeedback(roomId, { rating });
  }

  async searchRooms(query: string): Promise<void> {
    return this.roomsService.searchRooms(query);
  }

  // ─── Attachment methods ───────────────────────────────────
  addAttachment(file: File): void {
    const attachment: FileAttachment = {
      id: `file-${Date.now()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    };
    this._attachedFiles.update((files) => [...files, attachment]);
  }

  removeAttachment(fileId: string): void {
    this._attachedFiles.update((files) => files.filter((file) => file.id !== fileId));
  }

  clearAttachments(): void {
    this._attachedFiles.set([]);
  }
}
