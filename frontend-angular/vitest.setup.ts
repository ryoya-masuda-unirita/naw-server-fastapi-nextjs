import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

// Angular のテスト環境を初期化（全スイートで一度だけ呼ぶ必要があるため setupFiles に配置）
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
