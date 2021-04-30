import { MockedWebsocketSubject, unexpected } from './testing-helpers';
import { SerProtocolSubject } from './ser-protocol-subject';
import { ObjectUnsubscribedError } from 'rxjs';

describe('SerProtocolSubject', () => {
  let mockedWsConnection: MockedWebsocketSubject;
  let subject: SerProtocolSubject;

  beforeEach(() => {
    mockedWsConnection = new MockedWebsocketSubject(); // Mocks WS connection to received arbitrary messages and check for sent messages
    subject = new SerProtocolSubject(mockedWsConnection); // Constructs instance with mocked WS connection
  });

  it('should be constructed as open without any message yet', () => {
    subject.subscribe({
      next: unexpected,
      error: unexpected,
      complete: unexpected
    });

    expect().nothing(); // Nothing should happen at construction
  });

  describe('next()', () => {
    it('should throw if given command is undefined', () => {
      expect(() => subject.next(undefined)).toThrowError(Error);
      expect(subject.isStopped).toBeFalse(); // Protocol should still be open
    });

    it('should throw if subject was unsubscribed', () => {
      subject.unsubscribe(); // Unsubscribe subject for whatever reason

      expect(() => subject.next('any SER command')).toThrowError(ObjectUnsubscribedError);
      expect(subject.isStopped).toBeTrue(); // Protocol should be closed as it was unsubscribed
    });

    it('should send message if it is defined andsubject is open', () => {
      expect(() => subject.next('any SER command')).not.toThrow();
      // Check for SER command to have been formatted then sent to server
      expect(mockedWsConnection.nextMessage()).toEqual('SERVICE any SER command');
    });
  });

  describe('handleMessage()', () => {
    it('should pass value to next() callback', () => {
      let receivedCommand: string | undefined;
      subject.subscribe({ // Only except command to be received
        next: (serCommand: string) => receivedCommand = serCommand,
        error: unexpected,
        complete: unexpected
      });

      subject.handleCommand('any received SER command');

      // Checks for next() to have been called with appropriate command
      expect(receivedCommand).toBeDefined();
      expect(receivedCommand).toEqual('any received SER command');
    });
  });
});
