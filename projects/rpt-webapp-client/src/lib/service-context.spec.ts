import { ServiceContext } from './service-context';
import { BadSerCommand } from './ser-protocol.service';

describe('ServiceContext', () => {
  let context: ServiceContext;

  beforeEach(() => context = new ServiceContext()); // Works on a new instance for each unit test

  it('should construct with 0 as 1st UID and without any waiting SR', () => {
    for (let uid = 0; uid < 20; uid++) { // No UID should be unavailable right after construction
      expect(() => context.done(uid)).toThrowError(BadSerCommand);
    }

    expect(context.generateServiceRequestUid()).toEqual(0);
  });

  describe('generateServiceRequestUid()', () => {
    it('should increments UIDs by 1 and marks them as waiting', () => {
      for (let expectedUid = 0; expectedUid < 20; expectedUid++) { // Checks for UID incrementation
        expect(context.generateServiceRequestUid()).toEqual(expectedUid);
      }

      // Should be able to marks as responded UID no matter the order
      expect(() => context.done(17)).not.toThrow();
      expect(() => context.done(0)).not.toThrow();
      expect(() => context.done(8)).not.toThrow();
    });
  });

  describe('done()', () => {
    it('should throw if UID has no SR', () => {
      expect(() => context.done(42)).toThrowError(BadSerCommand); // No SR was sent with UID 42
    });

    it('should marks as responded SR if it is waiting, and no longer accepts that UID', () => {
      context.generateServiceRequestUid(); // Sends SR with UID 0

      expect(() => context.done(0)).not.toThrow(); // Sent with 0, should mark it as responded
      expect(() => context.done(0)).toThrowError(BadSerCommand); // 0 no longer accepted, already responded
    });
  });
});
