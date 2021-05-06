import { ServiceRequestResponse } from './service-request-response';
import { BadSerCommand } from './ser-protocol.service';

describe('ServiceRequestResponse', () => {
  it('should throw if response is not OK or KO', () => {
    expect(() => new ServiceRequestResponse('')).toThrowError(BadSerCommand);
    expect(() => new ServiceRequestResponse('Anything invalid')).toThrowError(BadSerCommand);
  });

  it('should be true if response is OK', () => {
    expect(new ServiceRequestResponse('OK').isSucceed()).toBeTrue();
  });

  it('should be false if response is KO', () => {
    expect(new ServiceRequestResponse('KO').isSucceed()).toBeFalse();
  });
});
