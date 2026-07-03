import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-content-copy-icon',
  standalone: true,
  template: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.99711 16.4984V7.49841C5.99711 7.08063 6.14294 6.72619 6.43461 6.43508C6.72627 6.14397 7.08044 5.99841 7.49711 5.99841H16.4971C16.9096 5.99841 17.2627 6.14528 17.5565 6.43903C17.8502 6.73278 17.9971 7.08591 17.9971 7.49841V13.9984L13.9971 17.9984H7.49711C7.08461 17.9984 6.73148 17.8515 6.43773 17.5578C6.14398 17.264 5.99711 16.9109 5.99711 16.4984ZM2.03877 5.35258C1.96933 4.9498 2.05613 4.5748 2.29919 4.22758C2.54225 3.88035 2.86516 3.67202 3.26794 3.60258L12.1221 2.01924C12.5249 1.9498 12.8964 2.0366 13.2367 2.27966C13.577 2.52271 13.7818 2.84563 13.8513 3.24841L14.0804 4.49841H12.5596L12.3721 3.49841L3.51794 5.08174L4.49711 10.5609V15.3109C4.27488 15.2137 4.08391 15.0673 3.92419 14.8717C3.76447 14.6762 3.66377 14.4545 3.62211 14.2067L2.03877 5.35258ZM7.49711 7.49841V16.4984H12.9971V12.9984H16.4971V7.49841H7.49711Z"
        [attr.fill]="disabled() ? '#adadad' : '#1a1a1a'"
        [attr.fill-opacity]="disabled() ? '0.6' : '1'"
      />
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
})
export class ContentCopyIconComponent {
  readonly disabled = input<boolean>(false);
}
