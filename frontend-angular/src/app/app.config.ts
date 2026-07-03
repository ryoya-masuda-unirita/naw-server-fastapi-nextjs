import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideMarkdown } from 'ngx-markdown';
import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialogModule } from '@angular/material/dialog';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { provideI18nInitializer } from '@core/i18n/i18n.initializer';
import { provideLoginKeyInitializer } from '@core/initializers/login-key.initializer';
import { I18N_ASSET_PREFIX, I18N_ASSET_SUFFIX } from '@core/i18n/i18n.constants';
import { baseUrlInterceptor } from '@core/interceptors/base-url.interceptor';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { loggingInterceptor } from '@core/interceptors/logging.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { mockInterceptor } from '@core/mocks/api-mock';
import { FixedTitleStrategy } from '@core/strategies/fixed-title.strategy';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideRouter(routes, withViewTransitions(), withComponentInputBinding()),
    { provide: TitleStrategy, useClass: FixedTitleStrategy },
    provideHttpClient(
      withInterceptors([
        baseUrlInterceptor,
        mockInterceptor,
        authInterceptor,
        loggingInterceptor,
        errorInterceptor,
      ]),
    ),
    importProvidersFrom(MatDialogModule),
    ...provideTranslateService({
      lang: 'ja',
      fallbackLang: 'ja',
    }),
    ...provideTranslateHttpLoader({
      prefix: I18N_ASSET_PREFIX,
      suffix: I18N_ASSET_SUFFIX,
    }),
    provideI18nInitializer(),
    provideLoginKeyInitializer(),
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: {
        fontSet: 'material-symbols-outlined',
      },
    },
    provideMarkdown(),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    ),
  ],
};
