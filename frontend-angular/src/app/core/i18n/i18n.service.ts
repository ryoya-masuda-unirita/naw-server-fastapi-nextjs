import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslationObject, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { I18N_ASSET_PREFIX, I18N_ASSET_SUFFIX, I18N_DEFAULT_LANG } from '@core/i18n/i18n.constants';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  resolveLanguage(): string {
    return localStorage.getItem('language') || I18N_DEFAULT_LANG;
  }

  async setLanguage(lang: string): Promise<void> {
    const translations = await firstValueFrom(
      this.http.get<TranslationObject>(`${I18N_ASSET_PREFIX}${lang}${I18N_ASSET_SUFFIX}`),
    );
    this.translate.setTranslation(lang, translations);
    await firstValueFrom(this.translate.use(lang));
    localStorage.setItem('language', lang);
  }

  async initialize(): Promise<void> {
    const lang = this.resolveLanguage();
    const fallbackLang = this.translate.getFallbackLang() ?? I18N_DEFAULT_LANG;

    if (fallbackLang !== lang) {
      const fallbackTranslations = await firstValueFrom(
        this.http.get<TranslationObject>(`${I18N_ASSET_PREFIX}${fallbackLang}${I18N_ASSET_SUFFIX}`),
      );
      this.translate.setTranslation(fallbackLang, fallbackTranslations);
    }

    await this.setLanguage(lang);
  }
}
