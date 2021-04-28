import { TestBed, waitForAsync } from '@angular/core/testing';
import { unexpected } from './testing-helpers';
import { BadRptlMode, BadSessionState, RptlProtocolService } from './rptl-protocol.service';
import { Subject } from 'rxjs';
import { Availability } from './availability';
import { Actor } from './actor';
import { ObjectUnsubscribedError } from 'rxjs';


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


describe('RptlProtocolService', () => {
  let service: RptlProtocolService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RptlProtocolService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should be constructed as not connected to any server', waitForAsync(() => {
    expect(service.serCommands.isStopped).toBeTrue(); // SER commands subject closed if not connected

    // Expect actors observable to be closed as there isn't any session to be registered on
    let noActors = false;
    service.getActors().subscribe({
      next: unexpected,
      error: () => noActors = true,
      complete: unexpected
    });
    expect(noActors).toBeTrue();

    // Registration should be impossible as there isn't any running session
    expect(() => service.register(0, '')).toThrowError(BadSessionState);
  }));

  it('should start a new session at beginSession() if current is not running', () => {
    const mockedWsConnection: MockedWebsocketSubject = new MockedWebsocketSubject();
    service.beginSession(mockedWsConnection);

    // Expect actors observable to be closed as session isn't on registered RPTL mode
    let noActors = false;
    service.getActors().subscribe({
      next: unexpected,
      error: () => noActors = true,
      complete: unexpected
    });
    expect(noActors).toBeTrue();

    // No actor should be owned by this client as it hasn't been registered yet
    expect(() => service.getSelf()).toThrowError(BadRptlMode);
  });

  it('should not retrieve server status if no session is running', () => {
    // Expect status observable to be closed as session isn't running
    let noStatus = false;
    service.getStatus().subscribe({
      next: unexpected,
      error: () => noStatus = true,
      complete: unexpected
    });
    expect(noStatus).toBeTrue();
  });

  it('should not send a checkout command if no session is running', () => {
    expect(() => service.updateStatusFromServer()).toThrowError(BadSessionState); // Running session required
  });

  it('should retrieve server status if session is running into unregistered mode', () => {
    const mockedWsConnection: MockedWebsocketSubject = new MockedWebsocketSubject();
    service.beginSession(mockedWsConnection);

    // Expect status to be retrieved from next value on observable as session is running
    let status: Availability | undefined;
    service.getStatus().subscribe({
      next: (newStatus: Availability) => status = newStatus,
      error: unexpected,
      complete: unexpected
    });

    mockedWsConnection.fromServer('AVAILABILITY 2 5'); // Server sends an update about its current status
    expect(status).toEqual(new Availability(2, 5)); // Observable should have received value and assigned it to status

    // Same steps with a new status again
    mockedWsConnection.fromServer('AVAILABILITY 4 5');
    expect(status).toEqual(new Availability(4, 5));
  });

  it('should send a checkout command if session is running into unregistered mode', () => {
    const mockedWsConnection: MockedWebsocketSubject = new MockedWebsocketSubject();
    service.beginSession(mockedWsConnection);

    expect(() => service.updateStatusFromServer()).not.toThrow();
    expect(mockedWsConnection.nextMessage()).toEqual('CHECKOUT'); // Expects RPTL command to have been sent to server
  });

  it('should be able to register if session has begun and no actor is already connected', () => {
    const mockedWsConnection: MockedWebsocketSubject = new MockedWebsocketSubject();
    service.beginSession(mockedWsConnection);

    expect(() => service.register(42, 'ThisALV')).not.toThrow(); // Registration command should be sent successfully
    mockedWsConnection.fromServer(' REGISTRATION  '); // Server RPTL response when no actor is already connected
    expect(service.getSelf()).toEqual(new Actor(42, 'ThisALV')); // Expect client own actor to be accessible and saved

    // Expect actors to be available but empty as no actor was already connected
    let actors: Actor[] | undefined;
    service.getActors().subscribe({
      next: (initialActors) => actors = initialActors,
      error: unexpected,
      complete: unexpected
    });
    service.updateActorsSubscribable(); // Must pushes a value inside actors subscribable
    expect(actors).toHaveSize(0);
  });

  it('should not send a checkout command if session is running into registered mode', () => {
    const mockedWsConnection: MockedWebsocketSubject = new MockedWebsocketSubject();
    service.beginSession(mockedWsConnection);

    service.register(42, 'ThisALV'); // Enters registered RPTL mode
    mockedWsConnection.fromServer('REGISTRATION'); // Emulates server registration confirmation

    expect(() => service.updateStatusFromServer()).toThrowError(BadRptlMode); // Unregistered RPTL mode required
  });
});
