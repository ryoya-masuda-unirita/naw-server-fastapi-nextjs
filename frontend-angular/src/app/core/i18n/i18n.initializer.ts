import { inject, provideAppInitializer } from '@angular/core';

import { I18nService } from '@core/i18n/i18n.service';

export function provideI18nInitializer() {
  return provideAppInitializer(() => inject(I18nService).initialize());
}
