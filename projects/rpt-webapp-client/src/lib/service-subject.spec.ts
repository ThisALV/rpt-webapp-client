import { ServiceSubject } from './service-subject';
import { MockedSerProtocolSubject, unexpected } from './testing-helpers';
import { ServiceContext } from './service-context';
import { ObjectUnsubscribedError } from 'rxjs';
import { BadSerCommand } from './ser-protocol.service';

describe('ServiceSubject', () => {
  const serviceName = 'TestingService'; // Service supposed to emits SR and receive SE commands

  let mockedSerProtocol: MockedSerProtocolSubject; // Mocking incoming SE commands and outgoing SR commands
  let context: ServiceContext; // Needs to check for side-effects on running ServiceContext
  let subject: ServiceSubject;

  beforeEach(() => {
    mockedSerProtocol = new MockedSerProtocolSubject();
    context = new ServiceContext(); // Uses a new context for each unit test so UIDs always begin from 0
    subject = new ServiceSubject(context, serviceName, mockedSerProtocol); // Works on a new instance for each unit test
  });

  it('should construct a new subject without commands', () => {
    subject.subscribe({ // No commands right after construction, nothing should happen
      next: unexpected,
      error: unexpected,
      complete: unexpected
    });

    expect().nothing();
  });

  describe('next()', () => {
    function expectToQueueWhenUnbound(): void {
      subject.next('a random command'); // SER subject completed, it will queue SER command because it cannot be sent for now
      subject.next('another command');
      expect(mockedSerProtocol.nextCommand()).toBeUndefined(); // SER no longer bound, messages queued and nothing sent on SER subject

      const newMockedSerProtocol: MockedSerProtocolSubject = new MockedSerProtocolSubject();
      subject.boundWith(newMockedSerProtocol); // Will send every queued message
      // Checks for queued commands to have been sent
      expect(newMockedSerProtocol.nextCommand()).toEqual('SERVICE REQUEST 0 TestingService a random command');
      expect(newMockedSerProtocol.nextCommand()).toEqual('SERVICE REQUEST 1 TestingService another command');
      // UIDs status inside ServiceContext is tested inside next() unit tests where SER subject isn't stopped
    }

    it('should throw if command is undefined', () => {
      expect(() => subject.next(undefined)).toThrowError(Error);
    });

    it('should throw if object was unsubscribed', () => {
      subject.unsubscribe();

      expect(() => subject.next('A random command')).toThrowError(ObjectUnsubscribedError);
    });

    it('should queue command if SER subject is completed', () => {
      mockedSerProtocol.complete();
      expectToQueueWhenUnbound();
    });

    it('should queue command if SER subject is errored', () => {
      mockedSerProtocol.error({ message: 'A random error' });
      expectToQueueWhenUnbound();
    });

    it('should call error() callbacks if SER subject next thrown', () => {
      // Emulates a command sending failure
      mockedSerProtocol.next = () => { throw new Error('A random error'); };

      let error: string | undefined;
      subject.subscribe({ // Should not receive command or complete, just notify an error occurred during command sending
        next: unexpected,
        error: (err: any) => error = err.message,
        complete: unexpected
      });

      expect(() => subject.next('a random command')).not.toThrow(); // Error should be caught
      // Checks for error() to have been called with appropriate error
      expect(error).toBeDefined();
      expect(error).toEqual('A random error');
      // Checks for used UID to no longer be available and to not being waiting for a response
      expect(() => context.done(0)).toThrowError(BadSerCommand);
    });

    it('should send ER command and mark UID as waiting if SER subject is not stopped', () => {
      subject.subscribe({
        next: unexpected, // next() callback should not be called
        error: unexpected,
        complete: unexpected
      });

      expect(() => subject.next('a random command')).not.toThrow();
      expect(() => subject.next('another command')).not.toThrow();
      // Should formats SER commands for RPTL protocol and sends it
      expect(mockedSerProtocol.nextCommand()).toEqual('SERVICE REQUEST 0 TestingService a random command');
      expect(mockedSerProtocol.nextCommand()).toEqual('SERVICE REQUEST 1 TestingService another command');
      // No more sent command expected
      expect(mockedSerProtocol.nextCommand()).toBeUndefined();
      // Checks for used UID to no longer be available
      expect(() => context.done(0)).not.toThrow();
    });
  });

  /*
   * boundWith() already tested inside next() should queue if SER subject stopped unit test
   */

  describe('complete()', () => {
    it('should throw as stopping a ServiceSubject is not allowed', () => {
      expect(() => subject.complete()).toThrowError(Error);
    });
  });

  describe('error()', () => {
    it('should call error() callback without stopping subject', () => {
      let error: string | undefined;
      subject.subscribe({ // Error notified is expected, nothing other than that
        next: unexpected,
        error: (err: any) => error = err.message,
        complete: unexpected
      });

      subject.error(new Error('A random error'));

      expect(error).toBeDefined();
      expect(error).toEqual('A random error');
      expect(subject.isStopped).toBeFalse(); // ServiceSubject should not be stopped under any circumstance
    });
  });

  describe('fire()', () => {
    it('should call next() callback', () => {
      let receivedCommand: string | undefined;
      subject.subscribe({ // Only expects SER command to be received
        next: (command: string) => receivedCommand = command,
        error: unexpected,
        complete: unexpected
      });

      subject.fire('a random command');

      expect(receivedCommand).toBeDefined(); // next() callback should have been called...
      expect(receivedCommand).toEqual('a random command'); // ...with the correct SER command
    });
  });
});
