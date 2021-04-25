import { TestBed } from '@angular/core/testing';

import { RptlProtocolService } from './rptl-protocol.service';

describe('RptlProtocolService', () => {
  let service: RptlProtocolService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RptlProtocolService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
