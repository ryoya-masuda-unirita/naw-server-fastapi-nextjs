import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="login-page flex min-h-screen flex-col justify-end">
      <main className="flex flex-1 flex-col items-center justify-center px-4 max-sm:justify-start max-sm:py-10">
        <div className="flex w-full max-w-158 flex-col items-center gap-8">
          <img
            src="/secuaigent-logo.png"
            alt="SecuAIgent Logo"
            className="h-[36.6px] w-60 max-w-full object-contain md:h-16 md:w-105"
          />

          <div className="flex w-full max-w-150 flex-col gap-8 rounded-4xl bg-surface-white px-4 pb-8 pt-6 md:p-8">
            {children}
          </div>
        </div>
      </main>

      <footer className="w-full bg-surface-footer px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <a
              href="https://www.unirita.co.jp/dcms_media/other/UNIRITA-Cloud-Service_SLA_support-policy.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs leading-[1.7] text-primary underline underline-offset-2"
            >
              {t('AUTH.FOOTER.TERMS')}
            </a>
            <a
              href="https://www.unirita.co.jp/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs leading-[1.7] text-primary underline underline-offset-2"
            >
              {t('AUTH.FOOTER.PRIVACY')}
            </a>
          </div>

          <div className="flex items-center justify-center gap-4 md:justify-end">
            <div className="inline-flex items-center text-[10px]">
              <p className="text-note-small text-text-medium">{t('AUTH.FOOTER.COMPANY_LABEL')}：</p>
              <a
                href="https://www.unirita.co.jp/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] leading-[1.4] text-primary underline underline-offset-2"
              >
                {t('AUTH.FOOTER.COMPANY_NAME')}
              </a>
            </div>
            <p className="text-[10px] font-bold leading-[1.4] text-text-muted">
              {t('AUTH.FOOTER.COPYRIGHT')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
