import { Component, input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { PaginationComponent } from './pagination.component';

// --------------- Fake TranslatePipe ---------------
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --------------- Mock stubs ---------------
@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class AppMatIconStub {
  icon = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

// --------------- Mock services ---------------
const mockRouter = { navigate: vi.fn() };
const mockActivatedRoute = { queryParams: of({}) };

// ================================================================
describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;
  let component: PaginationComponent;

  const setup = async (totalPages = 5, extraInputs: Record<string, unknown> = {}) => {
    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('totalPages', totalPages);
    fixture.componentRef.setInput('useQueryParams', false);
    for (const [key, value] of Object.entries(extraInputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [PaginationComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    })
      .overrideComponent(PaginationComponent, {
        set: { imports: [FakeTranslatePipe, AppMatIconStub, SvgIconStub] },
      })
      .compileComponents();
  });

  afterEach(() => vi.clearAllMocks());

  // ================================================================
  describe('初期値・ゲッター', () => {
    test('currentPageOverrideなしの場合currentPageが1であること', async () => {
      await setup(5);
      expect(component.currentPage()).toBe(1);
    });

    test('currentPageOverride=3のときcurrentPageが3になること', async () => {
      await setup(5, { currentPageOverride: 3 });
      expect(component.currentPage()).toBe(3);
    });

    test('currentPageOverride=0のときcurrentPageが1になること', async () => {
      await setup(5, { currentPageOverride: 0 });
      expect(component.currentPage()).toBe(1);
    });

    test('pageSizeOverrideなしの場合pageSizeがdefaultPageSize(10)になること', async () => {
      await setup(5);
      expect(component.pageSize()).toBe(10);
    });

    test('pageSizeOverride=20のときpageSizeが20になること', async () => {
      await setup(5, { pageSizeOverride: 20 });
      expect(component.pageSize()).toBe(20);
    });

    test('page=1のときcanGoPrevがfalseであること', async () => {
      await setup(5, { currentPageOverride: 1 });
      expect(component.canGoPrev()).toBe(false);
    });

    test('page=2のときcanGoPrevがtrueであること', async () => {
      await setup(5, { currentPageOverride: 2 });
      expect(component.canGoPrev()).toBe(true);
    });

    test('page=totalPagesのときcanGoNextがfalseであること', async () => {
      await setup(5, { currentPageOverride: 5 });
      expect(component.canGoNext()).toBe(false);
    });

    test('page<totalPagesのときcanGoNextがtrueであること', async () => {
      await setup(5, { currentPageOverride: 4 });
      expect(component.canGoNext()).toBe(true);
    });

    test('totalPages<=maxVisiblePagesのときvisiblePagesが全ページを返すこと', async () => {
      await setup(4);
      expect(component.visiblePages()).toEqual([1, 2, 3, 4]);
    });

    test('totalPages=1のときvisiblePagesが[1]を返すこと', async () => {
      await setup(1);
      expect(component.visiblePages()).toEqual([1]);
    });

    test('totalPages=10 page=1のときvisiblePagesに省略記号が含まれること', async () => {
      await setup(10, { currentPageOverride: 1 });
      expect(component.visiblePages()).toContain('…');
    });

    test('isNumber(1)がtrueを返すこと', async () => {
      await setup(5);
      expect(component.isNumber(1)).toBe(true);
    });

    test('isNumber("...")がfalseを返すこと', async () => {
      await setup(5);
      expect(component.isNumber('...')).toBe(false);
    });

    test('goToFirstPage: canGoPrevのときpage=1へ移動すること', async () => {
      await setup(5, { currentPageOverride: 3 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToFirstPage();
      expect(spy).toHaveBeenCalledWith(1);
    });

    test('goToFirstPage: page=1のときpageChangeを発火しないこと', async () => {
      await setup(5, { currentPageOverride: 1 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToFirstPage();
      expect(spy).not.toHaveBeenCalled();
    });

    test('goToLastPage: canGoNextのときlastPageへ移動すること', async () => {
      await setup(5, { currentPageOverride: 2 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToLastPage();
      expect(spy).toHaveBeenCalledWith(5);
    });

    test('goToLastPage: 最終ページのときpageChangeを発火しないこと', async () => {
      await setup(5, { currentPageOverride: 5 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToLastPage();
      expect(spy).not.toHaveBeenCalled();
    });

    test('goToPrevPage: currentPage-1のページへ移動すること', async () => {
      await setup(5, { currentPageOverride: 3 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToPrevPage();
      expect(spy).toHaveBeenCalledWith(2);
    });

    test('goToNextPage: currentPage+1のページへ移動すること', async () => {
      await setup(5, { currentPageOverride: 3 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToNextPage();
      expect(spy).toHaveBeenCalledWith(4);
    });

    test('goToPage: 現在ページと異なるページへ移動すること', async () => {
      await setup(5, { currentPageOverride: 1 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToPage(3);
      expect(spy).toHaveBeenCalledWith(3);
    });

    test('goToPage: 現在ページと同じ場合はpageChangeを発火しないこと', async () => {
      await setup(5, { currentPageOverride: 2 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToPage(2);
      expect(spy).not.toHaveBeenCalled();
    });

    test('goToPage: 文字列("...")の場合はpageChangeを発火しないこと', async () => {
      await setup(10, { currentPageOverride: 1 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      component.goToPage('...');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  describe('DOM要素表示', () => {
    test('showPageSize=trueのときページサイズセレクターが表示されること', async () => {
      await setup(5, { showPageSize: true });
      const el = fixture.debugElement.query(By.css('select#page-size-select'));
      expect(el).toBeTruthy();
    });

    test('showPageSize=falseのときページサイズセレクターが非表示になること', async () => {
      await setup(5, { showPageSize: false });
      const el = fixture.debugElement.query(By.css('select#page-size-select'));
      expect(el).toBeNull();
    });

    test('showPageNumbers=trueのときページ番号エリアが表示されること', async () => {
      await setup(5, { showPageNumbers: true });
      // visible pages container rendered — check for page number buttons
      const buttons = fixture.debugElement
        .queryAll(By.css('button'))
        .filter((b) =>
          /^\d+$/.test((b.nativeElement as HTMLButtonElement).textContent?.trim() ?? ''),
        );
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('showPageNumbers=falseのときページ番号が表示されないこと', async () => {
      await setup(5, { showPageNumbers: false });
      const buttons = fixture.debugElement
        .queryAll(By.css('button'))
        .filter((b) =>
          /^\d+$/.test((b.nativeElement as HTMLButtonElement).textContent?.trim() ?? ''),
        );
      expect(buttons.length).toBe(0);
    });

    test('countDisplayが設定されているとき件数表示が表示されること', async () => {
      await setup(5, { countDisplay: '1-10件 / 50件' });
      const el = fixture.debugElement.query(By.css('span'));
      expect(el?.nativeElement.textContent).toContain('1-10件 / 50件');
    });

    test('countDisplayが空のとき件数表示が非表示になること', async () => {
      await setup(5, { countDisplay: '' });
      const spans = fixture.debugElement.queryAll(By.css('span'));
      const countSpan = spans.find((s) =>
        (s.nativeElement as HTMLSpanElement).textContent?.includes('件'),
      );
      expect(countSpan).toBeUndefined();
    });

    test('showFirstLast=trueのときFirst/Lastボタンが表示されること', async () => {
      await setup(5, { showFirstLast: true });
      const firstBtn = fixture.debugElement.query(By.css('[aria-label="First page"]'));
      const lastBtn = fixture.debugElement.query(By.css('[aria-label="Last page"]'));
      expect(firstBtn).toBeTruthy();
      expect(lastBtn).toBeTruthy();
    });

    test('showFirstLast=falseのときFirst/Lastボタンが非表示になること', async () => {
      await setup(5, { showFirstLast: false });
      const firstBtn = fixture.debugElement.query(By.css('[aria-label="First page"]'));
      const lastBtn = fixture.debugElement.query(By.css('[aria-label="Last page"]'));
      expect(firstBtn).toBeNull();
      expect(lastBtn).toBeNull();
    });

    test('page=1のとき前へボタンがdisabledであること', async () => {
      await setup(5, { currentPageOverride: 1 });
      const prevBtn = fixture.debugElement.query(By.css('[aria-label="Previous page"]'));
      expect((prevBtn.nativeElement as HTMLButtonElement).disabled).toBe(true);
    });

    test('page=lastのとき次へボタンがdisabledであること', async () => {
      await setup(5, { currentPageOverride: 5 });
      const nextBtn = fixture.debugElement.query(By.css('[aria-label="Next page"]'));
      expect((nextBtn.nativeElement as HTMLButtonElement).disabled).toBe(true);
    });

    test('page>1のとき前へボタンがenabledであること', async () => {
      await setup(5, { currentPageOverride: 3 });
      const prevBtn = fixture.debugElement.query(By.css('[aria-label="Previous page"]'));
      expect((prevBtn.nativeElement as HTMLButtonElement).disabled).toBe(false);
    });
  });

  // ================================================================
  describe('DOM要素イベント', () => {
    test('前へボタンクリックでpageChangeが発火すること', async () => {
      await setup(5, { currentPageOverride: 3 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      const prevBtn = fixture.debugElement.query(By.css('[aria-label="Previous page"]'));
      (prevBtn.nativeElement as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(2);
    });

    test('次へボタンクリックでpageChangeが発火すること', async () => {
      await setup(5, { currentPageOverride: 3 });
      const spy = vi.spyOn(component.pageChange, 'emit');
      const nextBtn = fixture.debugElement.query(By.css('[aria-label="Next page"]'));
      (nextBtn.nativeElement as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(4);
    });

    test('FirstボタンクリックでpageChange(1)が発火すること', async () => {
      await setup(5, { currentPageOverride: 4, showFirstLast: true });
      const spy = vi.spyOn(component.pageChange, 'emit');
      const firstBtn = fixture.debugElement.query(By.css('[aria-label="First page"]'));
      (firstBtn.nativeElement as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(1);
    });

    test('LastボタンクリックでpageChange(totalPages)が発火すること', async () => {
      await setup(5, { currentPageOverride: 2, showFirstLast: true });
      const spy = vi.spyOn(component.pageChange, 'emit');
      const lastBtn = fixture.debugElement.query(By.css('[aria-label="Last page"]'));
      (lastBtn.nativeElement as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(5);
    });

    test('ページ番号ボタンクリックでpageChangeが発火すること', async () => {
      await setup(3, { currentPageOverride: 1, showPageNumbers: true });
      const spy = vi.spyOn(component.pageChange, 'emit');
      // Find the "3" page button
      const pageButtons = fixture.debugElement.queryAll(By.css('button')).filter((b) => {
        const text = (b.nativeElement as HTMLButtonElement).textContent?.trim();
        return text === '3';
      });
      expect(pageButtons.length).toBeGreaterThan(0);
      (pageButtons[0].nativeElement as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(3);
    });

    test('ページサイズ変更でpageSizeChangeが発火すること', async () => {
      await setup(5, { showPageSize: true });
      const spy = vi.spyOn(component.pageSizeChange, 'emit');
      const select = fixture.debugElement.query(By.css('select#page-size-select'));
      const selectEl = select.nativeElement as HTMLSelectElement;
      selectEl.value = '20';
      selectEl.dispatchEvent(new Event('change'));
      expect(spy).toHaveBeenCalledWith(20);
    });

    test('useQueryParams=trueのときnavigateが呼び出されること', async () => {
      fixture = TestBed.createComponent(PaginationComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('totalPages', 5);
      fixture.componentRef.setInput('useQueryParams', true);
      fixture.componentRef.setInput('currentPageOverride', 2);
      fixture.detectChanges();

      component.goToNextPage();
      expect(mockRouter.navigate).toHaveBeenCalled();
    });
  });
});
