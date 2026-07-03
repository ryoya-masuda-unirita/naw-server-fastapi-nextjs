import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { SelectOption } from '@app-types/common';

export const ASSISTANT_LIST_API_PATH = {
  LIST: '/admin/assistants',
  CATEGORIES: '/admin/assistant-categories',
  CATEGORIES_OPTIONS: '/admin/assistant-categories/options',
  OPTIONS_SERVERS: '/admin/assistants/server-options',
  OPTIONS_APIS: '/admin/assistants/api-options',
  OPTIONS_MODELS: '/admin/assistants/model-options',
  ENDPOINTS_BY_TYPE: (type: string) => `/admin/assistants/endpoints/${type}`,
  AI_MODELS: '/admin/assistants/AIModels',
  OPTIONS_GROUPS: '/admin/all-groups',
  OPTIONS_DICTIONARIES: '/admin/assistants/dictionary-options',
  INDEXES: '/admin/indexes',
} as const;

export const ASSISTANT_SERVER_TYPE = {
  SECURE: 'SECURE',
  SAAS_CHAT: 'SAAS_CHAT',
  SAAS_RAG: 'SAAS_RAG',
} as const;

export const ASSISTANT_SERVER_OPTIONS: SelectOption[] = [
  { value: ASSISTANT_SERVER_TYPE.SECURE, label: 'セキュア' },
  { value: ASSISTANT_SERVER_TYPE.SAAS_CHAT, label: 'クラウド(一般)' },
  { value: ASSISTANT_SERVER_TYPE.SAAS_RAG, label: 'クラウド(学習先指定)' },
];

export const checkFolderWithServerCloud: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const folder = control.get('folder');
  const serverType = control.get('serverType');

  if (!folder || !serverType) {
    return null;
  }

  if (
    serverType.value === ASSISTANT_SERVER_TYPE.SAAS_RAG &&
    (!folder.value || folder.value.trim() === '')
  ) {
    folder.setErrors({ folderRequired: true });
    return { folderRequired: true };
  }

  if (folder.hasError('folderRequired')) {
    folder.setErrors(null);
  }

  return null;
};
