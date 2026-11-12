import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs/operators';
import { injectQuery } from '@tanstack/angular-query-experimental';
import type { SelectOption } from '@app-types/common';
import type { AssistantApiItem } from '@app-types/admin/assistant.types';
import type { PagedResponse } from '@app-types/api-response.type';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { FeedbackMessageApiService } from './feedback-message-api.service';
import { satisfactionOptions } from '../feedback.constant';

@Injectable({ providedIn: 'root' })
export class FeedbackListOptionsService {
  private readonly translate = inject(TranslateService);
  private readonly feedbackApiService = inject(FeedbackMessageApiService);
  private readonly api = inject(ApiClientService);

  private readonly currentLang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
    initialValue: this.translate.getCurrentLang(),
  });

  // 管理者向け全アシスタント一覧（ユーザー向け /assistants ではなく /admin/assistants を使う）
  readonly adminAssistantsQuery = injectQuery(() => ({
    queryKey: ['admin', 'assistants', 'all'],
    queryFn: async () => {
      const res = await this.api.get<PagedResponse<AssistantApiItem>>(
        API_PATHS.ADMIN.ASSISTANTS.LIST,
      );
      return res.content;
    },
  }));

  readonly assistantOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    const allOption: SelectOption = {
      value: 'all',
      label: this.translate.instant('FEEDBACK.ALL_ASSISTANTS'),
    };
    const options = (this.adminAssistantsQuery.data() ?? []).map((a) => ({
      value: a.id,
      label: a.name,
    }));
    return [allOption, ...options];
  });

  readonly folders = computed(
    () => this.feedbackApiService.learningFoldersQuery.data()?.data ?? [],
  );

  readonly folderOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    const allOption: SelectOption = {
      value: 'all',
      label: this.translate.instant('FEEDBACK.ALL_FOLDERS'),
    };
    const folderOptions = this.folders().map((f) => ({
      value: f.id,
      label: f.name,
    }));
    return [allOption, ...folderOptions];
  });

  readonly satisfactionOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return satisfactionOptions(this.translate.instant('FEEDBACK.ALL_SATISFACTION'));
  });
}
