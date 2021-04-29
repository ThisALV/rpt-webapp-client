import { TestBed } from '@angular/core/testing';
import { unexpected } from './testing-helpers';
import { BadConnectionSubject, BadRptlMode, BadSessionState, RptlProtocolService } from './rptl-protocol.service';
import { Observable, Subject } from 'rxjs';
import { Actor } from './actor';
import { ObjectUnsubscribedError } from 'rxjs';
import { Availability } from './availability';


/**
 * Mocking for `WebSocketSubject` form rxjs, consisting in a Subject which next() method does not call observers next() member, and two
 * new methods `fromServer()` and `nextMessage()` which respectively call observers next() with a message from server and poll the next
 * message sent by the client.
 */
class MockedWebsocketSubject extends Subject<string> {
  // Queue for messages sent by client
  private messagesQueue: string[];

  constructor() {
    super();
    this.messagesQueue = []; // No sent messages at initialization
  }

  /**
   * Pushes given initialized message into messages queue if subject is not completed/errored.
   *
   * @param value Message to push
   *
   * @throws ObjectUnsubscribedError if subject was unsubscribed
   * @throws Error if message is `undefined`
   */
  next(value?: string): void {
    if (value === undefined) { // Doesn't handle uninitialized value
      throw new Error('Message must be initialized');
    }

    if (this.closed) { // Checks for subject to not have been unsubscribed
      throw new ObjectUnsubscribedError();
    }

    if (!this.isStopped) { // Checks for subject to not have been completed/errored
      this.messagesQueue.unshift(value); // Push back message into FIFO queue
    }
  }

  /**
   * Calls original subject `next()` method with given value to send message to client.
   *
   * @param value Message to be received by client
   */
  fromServer(value: string): void {
    super.next(value);
  }

  /**
   * @returns Next message inside queue, if any
   *
   * @throws Error if messages queue is empty
   */
  nextMessage(): string {
    const returnedMessage: string | undefined = this.messagesQueue.pop();

    if (returnedMessage === undefined) {
      throw new Error('No more messages sent by client');
    }

    return returnedMessage;
  }
}


/**
 * Expects that only error() callback of subscriber for given observable will be called.
 *
 * @param observable Observable to check state for
 * @param routine Routine that should put given observable into errored state
 */
function expectToBeErrored(observable: Observable<any>, routine?: () => void): void {
  let hasError = false;
  observable.subscribe({
    next: unexpected,
    error: () => hasError = true,
    complete: unexpected
  });

  // An action might be necessary to put given observable into errored state
  if (routine !== undefined) {
    routine();
  }

  expect(hasError).toBeTrue(); // Only error callback should have been called
}


describe('RptlProtocolService', () => {
  let service: RptlProtocolService;
  let mockedWsConnection: MockedWebsocketSubject;


  /**
   * Puts service session into registered with own actor [42] ThisALV and one already connected actor [0] Redox.
   */
  function mockRegistration(): void {
    // Sends handshake to server
    service.register(42, 'ThisALV');
    // Mocks server handshake response with some actors already connected
    mockedWsConnection.fromServer('REGISTRATION 42 ThisALV 0 Redox'); // Puts session into registered RPTL mode
  }


  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RptlProtocolService);

    mockedWsConnection = new MockedWebsocketSubject(); // Creates a new mocked connection for each unit test
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should be constructed as not connected to any server', () => {
    expect(service.isSessionRunning()).toBeFalse();
  });

  describe('beginSession()', () => {
    it('should throw if new connection is completed', () => {
      mockedWsConnection.complete();
      expect(() => service.beginSession(mockedWsConnection)).toThrowError(BadConnectionSubject);
      expect(service.isSessionRunning()).toBeFalse();
    });

    it('should throw if new connection is errored', () => {
      mockedWsConnection.error({ message: 'A random error' });
      expect(() => service.beginSession(mockedWsConnection)).toThrowError(BadConnectionSubject);
      expect(service.isSessionRunning()).toBeFalse();
    });

    it('should run session if it is not already running', () => {
      expect(() => service.beginSession(mockedWsConnection)).not.toThrow();
      expect(service.isSessionRunning()).toBeTrue();
    });

    it('should throw if session is already running', () => {
      service.beginSession(mockedWsConnection); // Puts session into running state
      expect(() => service.beginSession(mockedWsConnection)).toThrowError(BadSessionState); // Already running
      expect(service.isSessionRunning()).toBeTrue(); // Should not have stopped current session
    });

    it('should stop session when connection is completed', () => {
      service.beginSession(mockedWsConnection);
      expect(service.isSessionRunning()).toBeTrue();

      mockedWsConnection.complete();
      expect(service.isSessionRunning()).toBeFalse();
    });

    it('should stop session when connection is errored', () => {
      service.beginSession(mockedWsConnection);
      expect(service.isSessionRunning()).toBeTrue();

      mockedWsConnection.error({ message: 'A random error' });
      expect(service.isSessionRunning()).toBeFalse();
    });
  });

  describe('endSession()', () => {
    it('should throw if session is not running', () => {
      expect(() => service.endSession()).toThrowError(BadSessionState);
    });

    it('should send logout command into registered mode', () => {
      service.beginSession(mockedWsConnection);
      mockRegistration();

      expect(() => service.endSession()).not.toThrow();
      expect(service.isSessionRunning()).toBeTrue(); // Session should still be running, waiting for server to close connection

      mockedWsConnection.nextMessage(); // Registration has sent one message, ignores it to test logout command message
      expect(mockedWsConnection.nextMessage()).toEqual('LOGOUT'); // Checks for command to have been sent
    });

    it('should stop session into unregistered mode', () => {
      service.beginSession(mockedWsConnection);

      expect(() => service.endSession()).not.toThrow();
      expect(service.isSessionRunning()).toBeFalse(); // Unregistered, connection should be closed immediately
    });
  });

  describe('getActors()', () => {
    it('should return errored observable if session is not running', () => {
      expectToBeErrored(service.getActors());
    });

    it('should return errored observable if session is into unregistered mode', () => {
      service.beginSession(mockedWsConnection); // Puts session into running state as unregistered
      expectToBeErrored(service.getActors());
    });

    it('should retrieve actors observable if session is into registered mode', () => {
      service.beginSession(mockedWsConnection);

      // Sends handshake to server
      service.register(42, 'ThisALV');
      // Mocks server handshake response with some actors already connected
      mockedWsConnection.fromServer('REGISTRATION 42 ThisALV 0 Redox');

      let actors: Actor[] | undefined;
      service.getActors().subscribe({ // Only next callback should be called to push a new actors list
        next: (newActors: Actor[]) => actors = newActors,
        error: unexpected,
        complete: unexpected
      });

      // Required to get current actors list as returned observable is new
      // Session running into registered, should work, serves as a unit test for updateActorsSubscribable()
      service.updateActorsSubscribable();

      expect(actors).toBeDefined(); // next() should have been called
      // Checks for actors list content to match RPTL state, no matter their order inside list
      expect(actors).toHaveSize(2);
      expect(actors).toContain(new Actor(42, 'ThisALV'));
      expect(actors).toContain(new Actor(0, 'Redox'));
    });
  });

  describe('updateActorsSubscribable()', () => {
    it('should throw if session is not running', () => {
      expect(() => service.updateActorsSubscribable()).toThrowError(BadSessionState);
    });

    it('should throw if session is running into unregistered mode', () => {
      service.beginSession(mockedWsConnection);
      expect(() => service.updateActorsSubscribable()).toThrowError(BadRptlMode);
    });

    // Correct method call is tested through getActors() unit testing
  });

  describe('getStatus()', () => {
    it('should return errored observable if session is not running', () => {
      expectToBeErrored(service.getStatus());
    });

    it('should return errored observable if session is running into registered mode', () => {
      service.beginSession(mockedWsConnection); // Puts session into running state as unregistered

      // Sends handshake to server
      service.register(42, 'ThisALV');
      // Mocks server handshake response with some actors already connected
      mockedWsConnection.fromServer('REGISTRATION 42 ThisALV 0 Redox'); // Puts session into registered RPTL mode

      expectToBeErrored(service.getStatus());
    });

    it('should retrieve server status observable if session is running into unregistered mode', () => {
      service.beginSession(mockedWsConnection); // Puts session into running state as unregistered

      let serverStatus: Availability | undefined;
      service.getStatus().subscribe({ // Only next() should be called to push new server status
        next: (newStatus: Availability) => serverStatus = newStatus,
        error: unexpected,
        complete: unexpected
      });

      // Required to update server status, will serves as a unit test for AVAILABILITY command handler
      mockedWsConnection.fromServer('AVAILABILITY 2 5');

      expect(serverStatus).toBeDefined(); // next() should have assigned an updated server status
      expect(serverStatus).toEqual(new Availability(2, 5)); // Checks for status content
    });
  });

  describe('updateStatusFromServer()', () => {
    it('should throw if session is not running', () => {
      expect(() => service.updateStatusFromServer()).toThrowError(BadSessionState);
    });

    it('should throw if session is running into registered mode', () => {
      service.beginSession(mockedWsConnection);
      mockRegistration();

      expect(() => service.updateStatusFromServer()).toThrowError(BadRptlMode);
    });

    it('should send checkout command is session is running into unregistered mode', () => {
      service.beginSession(mockedWsConnection);

      expect(() => service.updateStatusFromServer()).not.toThrow();
      expect(mockedWsConnection.nextMessage()).toEqual('CHECKOUT'); // This method should just send the checkout command to server
    });
  });

  describe('getSerProtocol()', () => {
    it('should return errored observalb if session is not running', () => {
      expectToBeErrored(service.getSerProtocol());
    });

    it('should return errored observable if session is into unregistered mode', () => {
      service.beginSession(mockedWsConnection); // Puts session into running state as unregistered
      expectToBeErrored(service.getSerProtocol());
    });

    it('should retrieve SER Protocol subject if session is running into registered mode', () => {
      // Puts session into running state as registered
      service.beginSession(mockedWsConnection);
      mockRegistration();

      service.getSerProtocol().subscribe({ // Should not be errored or completed
        next: () => expect().nothing(),
        error: unexpected,
        complete: unexpected
      });
    });
  });

  describe('getSelf()', () => {

  });

  describe('register()', () => {

  });

  describe('Command handlers', () => {

  });
});
