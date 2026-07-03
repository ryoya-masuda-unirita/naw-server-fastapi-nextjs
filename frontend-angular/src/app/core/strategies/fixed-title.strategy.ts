import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class FixedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(_: RouterStateSnapshot): void {
    this.title.setTitle('SecuAiGent');
  }
}
