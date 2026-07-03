import { inject, Injectable } from '@angular/core';
import { environment } from '@env/environment';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';
import { parseSseChunk } from '@core/utils/sse-parser';
import { resolveTenantId } from '@core/utils/tenant.helpers';
import {
  mapMessageContentItemToAssistantMessage,
  MessageContentApiItem,
} from '@app-types/chat/message-api.type';
import {
  MessageContentStreamEvent,
  MessageContentStreamHandlers,
} from '@app-types/chat/message-content-stream.type';
import { Message } from '@app-types/chat/message.type';

@Injectable({ providedIn: 'root' })
export class MessageContentStreamService {
  private readonly api = inject(ApiClientService);

  async streamMessageContent(
    formData: FormData,
    localMessageId: string,
    handlers: MessageContentStreamHandlers,
  ): Promise<Message> {
    if (environment.enableMock) {
      return this.streamMessageContentMock(formData, localMessageId, handlers);
    }
    return this.streamMessageContentFetch(formData, localMessageId, handlers);
  }

  private async streamMessageContentMock(
    formData: FormData,
    localMessageId: string,
    handlers: MessageContentStreamHandlers,
  ): Promise<Message> {
    const raw = await this.api.post<MessageContentApiItem | Record<string, unknown>>(
      API_PATHS.MESSAGES.CONTENT,
      formData,
    );
    const item = this.normalizeContentItem(raw);
    const answer = item.answer?.trim() ?? '';
    if (answer) {
      this.emitTextDeltas(answer, handlers.onTextDelta);
    }
    handlers.onMessageContent(item);
    return mapMessageContentItemToAssistantMessage(item, localMessageId);
  }

  private async streamMessageContentFetch(
    formData: FormData,
    localMessageId: string,
    handlers: MessageContentStreamHandlers,
  ): Promise<Message> {
    const url = this.resolveApiUrl(API_PATHS.MESSAGES.CONTENT);
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    const tenantId = resolveTenantId();
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Message content stream failed (${response.status})`);
    }
    if (!response.body) {
      throw new Error('Message content stream has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalItem: MessageContentApiItem | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        const events = parseSseChunk(buffer, chunk);
        let result = events.next();
        while (!result.done) {
          finalItem = this.dispatchStreamEvent(result.value, handlers, finalItem) ?? finalItem;
          result = events.next();
        }
        buffer = result.value;
      }

      if (buffer.trim()) {
        const trailing = parseSseChunk('', `${buffer}\n`);
        let result = trailing.next();
        while (!result.done) {
          finalItem = this.dispatchStreamEvent(result.value, handlers, finalItem) ?? finalItem;
          result = trailing.next();
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!finalItem) {
      throw new Error('Message content stream ended without message_content event');
    }

    return mapMessageContentItemToAssistantMessage(finalItem, localMessageId);
  }

  private dispatchStreamEvent(
    raw: unknown,
    handlers: MessageContentStreamHandlers,
    currentFinal: MessageContentApiItem | null,
  ): MessageContentApiItem | null {
    const event = this.parseStreamEvent(raw);
    if (!event) {
      return currentFinal;
    }

    switch (event.type) {
      case 'reasoning_delta':
        handlers.onReasoningDelta?.(event.text);
        return currentFinal;
      case 'text_delta':
        handlers.onTextDelta(event.text);
        return currentFinal;
      case 'library_title_delta':
        handlers.onLibraryTitleDelta?.(event.text);
        return currentFinal;
      case 'library_content_delta':
        handlers.onLibraryContentDelta?.(event.text);
        return currentFinal;
      case 'message_stop':
        handlers.onMessageStop?.({
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        });
        return currentFinal;
      case 'message_content':
        handlers.onMessageContent(event.data);
        return event.data;
      default:
        return currentFinal;
    }
  }

  private parseStreamEvent(raw: unknown): MessageContentStreamEvent | null {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) {
      return null;
    }
    const record = raw as Record<string, unknown>;
    const type = record['type'];

    if (type === 'reasoning_delta' && typeof record['text'] === 'string') {
      return { type: 'reasoning_delta', text: record['text'] };
    }
    if (type === 'text_delta' && typeof record['text'] === 'string') {
      return { type: 'text_delta', text: record['text'] };
    }
    if (type === 'library_title_delta' && typeof record['text'] === 'string') {
      return { type: 'library_title_delta', text: record['text'] };
    }
    if (type === 'library_content_delta' && typeof record['text'] === 'string') {
      return { type: 'library_content_delta', text: record['text'] };
    }
    if (type === 'message_stop') {
      return {
        type: 'message_stop',
        inputTokens: Number(record['inputTokens'] ?? 0),
        outputTokens: Number(record['outputTokens'] ?? 0),
      };
    }
    if (type === 'message_content' && record['data'] && typeof record['data'] === 'object') {
      return {
        type: 'message_content',
        data: this.normalizeContentItem(record['data'] as Record<string, unknown>),
      };
    }
    return null;
  }

  private normalizeContentItem(
    raw: MessageContentApiItem | Record<string, unknown>,
  ): MessageContentApiItem {
    const item = raw as MessageContentApiItem;
    return {
      id: String(item.id ?? ''),
      messageId: String(item.messageId ?? ''),
      status: item.status ?? 'OK',
      question: item.question ?? null,
      answer: item.answer ?? null,
      context: item.context ?? null,
      attachmentFiles: item.attachmentFiles ?? [],
      referencePaths: item.referencePaths ?? null,
      isRated: Boolean(item.isRated),
      message: item.message ?? null,
    };
  }

  private emitTextDeltas(answer: string, onTextDelta: (text: string) => void): void {
    const chunkSize = 32;
    for (let i = 0; i < answer.length; i += chunkSize) {
      onTextDelta(answer.slice(i, i + chunkSize));
    }
  }

  private resolveApiUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    const base = environment.apiBaseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }
}
