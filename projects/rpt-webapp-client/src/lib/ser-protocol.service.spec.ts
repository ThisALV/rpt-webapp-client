import { TestBed } from '@angular/core/testing';

import { SerProtocolService } from './ser-protocol.service';

describe('SerProtocolService', () => {
  let service: SerProtocolService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SerProtocolService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
