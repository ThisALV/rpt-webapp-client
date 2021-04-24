import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RptWebappClientComponent } from './rpt-webapp-client.component';

describe('RptWebappClientComponent', () => {
  let component: RptWebappClientComponent;
  let fixture: ComponentFixture<RptWebappClientComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RptWebappClientComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RptWebappClientComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
