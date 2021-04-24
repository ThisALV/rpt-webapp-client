import { TestBed } from '@angular/core/testing';

import { RptWebappClientService } from './rpt-webapp-client.service';

describe('RptWebappClientService', () => {
  let service: RptWebappClientService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RptWebappClientService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
