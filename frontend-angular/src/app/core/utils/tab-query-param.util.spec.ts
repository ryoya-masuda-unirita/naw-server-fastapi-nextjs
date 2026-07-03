import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { TabItem } from '@app-types/tab.type';
import {
  createTabQueryParam,
  resolveTabQueryParam,
  shouldNormalizeTabQueryParam,
} from '@core/utils/tab-query-param.util';

describe('resolveTabQueryParam', () => {
  const validTabs = ['terms', 'tags'] as const;

  it('returns the tab when it is valid', () => {
    expect(resolveTabQueryParam('tags', validTabs, 'terms')).toBe('tags');
  });

  it('returns defaultTab when tab is missing', () => {
    expect(resolveTabQueryParam(undefined, validTabs, 'terms')).toBe('terms');
  });

  it('returns defaultTab when tab is invalid', () => {
    expect(resolveTabQueryParam('invalid', validTabs, 'terms')).toBe('terms');
  });

  it('returns defaultTab when tab is not a string', () => {
    expect(resolveTabQueryParam(123, validTabs, 'terms')).toBe('terms');
  });
});

describe('shouldNormalizeTabQueryParam', () => {
  it('returns true when raw tab differs from resolved tab', () => {
    expect(shouldNormalizeTabQueryParam(undefined, 'terms')).toBe(true);
    expect(shouldNormalizeTabQueryParam('invalid', 'terms')).toBe(true);
  });

  it('returns false when raw tab matches resolved tab', () => {
    expect(shouldNormalizeTabQueryParam('tags', 'tags')).toBe(false);
  });
});

@Component({
  standalone: true,
  template: '',
})
class TabQueryHostComponent {
  readonly tabState = createTabQueryParam({
    validTabs: ['accuracy', 'satisfaction', 'count'] as const,
    defaultTab: 'accuracy',
  });
}

describe('createTabQueryParam', () => {
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabQueryHostComponent],
      providers: [provideRouter([{ path: '', component: TabQueryHostComponent }])],
    }).compileComponents();

    TestBed.createComponent(TabQueryHostComponent);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('normalizes missing tab query param to defaultTab', async () => {
    await router.navigateByUrl('/');
    TestBed.createComponent(TabQueryHostComponent);
    TestBed.flushEffects();

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { tab: 'accuracy' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
    );
  });

  it('normalizes invalid tab query param to defaultTab', async () => {
    await router.navigateByUrl('/?tab=unknown');
    TestBed.createComponent(TabQueryHostComponent);
    TestBed.flushEffects();

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { tab: 'accuracy' },
        replaceUrl: true,
      }),
    );
  });

  it('does not normalize when tab query param is valid', async () => {
    vi.mocked(router.navigate).mockClear();
    await router.navigateByUrl('/?tab=satisfaction');
    const fixture = TestBed.createComponent(TabQueryHostComponent);
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(fixture.componentInstance.tabState.activeTabId()).toBe('satisfaction');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('onTabChange updates tab and clears page params', () => {
    const host = TestBed.createComponent(TabQueryHostComponent).componentInstance;
    vi.mocked(router.navigate).mockClear();

    const tab: TabItem = { id: 'count', label: 'Count' };
    host.tabState.onTabChange(tab);

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { tab: 'count', page: null, pageSize: null },
        queryParamsHandling: 'merge',
      }),
    );
  });
});
