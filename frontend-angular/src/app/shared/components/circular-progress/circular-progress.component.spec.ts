import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CircularProgressComponent } from './circular-progress.component';

describe('CircularProgressComponent', () => {
  let component: CircularProgressComponent;
  let fixture: ComponentFixture<CircularProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CircularProgressComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CircularProgressComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('current', 500000);
    fixture.componentRef.setInput('limit', 3500000);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
