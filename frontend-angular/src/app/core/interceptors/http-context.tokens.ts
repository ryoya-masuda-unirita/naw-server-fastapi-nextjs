import { HttpContextToken } from '@angular/common/http';

/** 呼び出し元でエラートーストを表示するリクエストでは、errorInterceptor のトーストを抑止する */
export const SKIP_GLOBAL_ERROR_TOAST = new HttpContextToken<boolean>(() => false);
