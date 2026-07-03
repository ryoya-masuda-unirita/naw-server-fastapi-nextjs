import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { environment } from '@env/environment';
import { delay, Observable, of, throwError } from 'rxjs';
import { MOCK_ROOMS as INITIAL_MOCK_ROOMS } from '../constants/mock-data/rooms.mock';
import { adminAssistantsMockRoutes } from './handlers/admin-assistants.mock';
import { adminFeedbackMockRoutes } from './handlers/admin-feedback.mock';
import { adminGlossaryDictionaryMockRoutes } from './handlers/admin-glossary-dictionary.mock';
import { adminGlossaryTagsMockRoutes } from './handlers/admin-glossary-tags.mock';
import { adminGlossaryTermsMockRoutes } from './handlers/admin-glossary-terms.mock';
import { adminGroupsMockRoutes } from './handlers/admin-groups.mock';
import { adminHistoriesMockRoutes } from './handlers/admin-histories.mock';
import { adminPromptTemplatesMockRoutes } from './handlers/admin-prompt-templates.mock';
import { promptTemplatesMockRoutes } from './handlers/prompt-templates.mock';
import { adminTagsMockRoutes } from './handlers/admin-tags.mock';
import { adminTenantMockRoutes } from './handlers/admin-tenant.mock';
import { adminTrainingDataMockRoutes } from './handlers/admin-training-data.mock';
import { adminUsersMockRoutes } from './handlers/admin-users.mock';
import { authMockRoutes } from './handlers/auth.mock';
import { commonPageMockRoutes } from './handlers/common-page.mock';
import { libraryMockRoutes } from './handlers/library.mock';
import { messageMockRoutes } from './handlers/message.mock';
import { roomMockRoutes } from './handlers/rooms.mock';
import { shareMockRoutes } from './handlers/shares.mock';
import { tokenUsageMockRoutes } from './handlers/token-usage.mock';
import { creditUsageMockRoutes } from './handlers/credit-usage.mock';
import { userGlossaryDictionaryMockRoutes } from './handlers/user-glossary-dictionary.mock';
import { userGlossaryTermsMockRoutes } from './handlers/user-glossary-terms.mock';
import { userProfileMockRoutes } from './handlers/user-profile.mock';
import { viewerMockRoutes } from './handlers/viewer.mock';

const MOCK_DELAY = 300;
const runtimeRooms = [...INITIAL_MOCK_ROOMS];

export interface MockRoute {
  method: string;
  match: string | RegExp;
  handler: (url: string, body: unknown, params: Record<string, string>) => [number, unknown];
}

function stripBaseUrl(url: string): string {
  const base = environment.apiBaseUrl;
  if (url.startsWith(base)) return url.slice(base.length);
  return url;
}

function getParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return params;
  const search = new URLSearchParams(url.slice(queryIndex));
  search.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

function getPathOnly(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

const routes: MockRoute[] = [
  ...authMockRoutes,
  ...roomMockRoutes(runtimeRooms),
  ...messageMockRoutes(runtimeRooms),
  ...shareMockRoutes(runtimeRooms),
  ...commonPageMockRoutes,
  ...libraryMockRoutes,
  ...userProfileMockRoutes,
  ...adminTagsMockRoutes,
  ...adminUsersMockRoutes,
  ...adminTrainingDataMockRoutes,
  ...adminTenantMockRoutes,
  ...tokenUsageMockRoutes,
  ...creditUsageMockRoutes,
  ...adminPromptTemplatesMockRoutes,
  ...promptTemplatesMockRoutes,
  ...adminGlossaryTermsMockRoutes,
  ...adminGlossaryTagsMockRoutes,
  ...adminGlossaryDictionaryMockRoutes,
  ...userGlossaryTermsMockRoutes,
  ...userGlossaryDictionaryMockRoutes,
  ...adminGroupsMockRoutes,
  ...adminAssistantsMockRoutes,
  ...adminFeedbackMockRoutes,
  ...adminHistoriesMockRoutes,
  ...viewerMockRoutes,
];

function findRoute(method: string, path: string): MockRoute | undefined {
  return routes.find((route) => {
    if (route.method !== method) return false;
    if (typeof route.match === 'string') return getPathOnly(path) === route.match;
    return route.match.test(getPathOnly(path));
  });
}

export const mockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.enableMock) return next(req);

  const path = stripBaseUrl(req.urlWithParams);
  const pathOnly = stripBaseUrl(getPathOnly(req.urlWithParams));
  const route = findRoute(req.method, pathOnly);

  if (!route) return next(req);

  const params = getParams(path);
  const [status, responseBody] = route.handler(pathOnly, req.body, params);

  if (status >= 400) {
    return (of(null) as Observable<null>).pipe(delay(MOCK_DELAY), () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status,
            statusText: 'Mock Error',
            error: responseBody,
            url: req.urlWithParams,
          }),
      ),
    );
  }

  return of(new HttpResponse({ status, body: responseBody, url: req.urlWithParams })).pipe(
    delay(MOCK_DELAY),
  );
};
