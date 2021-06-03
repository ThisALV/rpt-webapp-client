import { TestBed } from '@angular/core/testing';
import { SerProtocolService, UnavailableServiceName } from './ser-protocol.service';
import { Observable, Subject } from 'rxjs';
import { MockedSerProtocolSubject, unexpected } from './testing-helpers';
import { RptlProtocolService, RptlState } from './rptl-protocol.service';


/**
 * Mocking for `RptlProtocolService` providing an accessible `MockedSerProtocolSubject` which can be checked for, a way to terminate
 * connection with server using mocked `endSession()` method and a way to mock a `RptlState.REGISTERED` event with it's controlled
 * subject `state`.
 */
class MockedRptlProtocol {
  /**
   * Mocks SER commands sending and receiving to/from server.
   */
  serProtocol: MockedSerProtocolSubject;

  /**
   * Checks if endSession() has been called.
   */
  sessionTerminated: boolean;

  /**
   * Mocks RPTL protocol updated state current state.
   */
  state: Subject<RptlState>;

  constructor() {
    this.serProtocol = new MockedSerProtocolSubject();
    this.sessionTerminated = false;
    this.state = new Subject<RptlState>();
  }

  getSerProtocol(): Subject<string> {
    return this.serProtocol;
  }

  endSession(): void {
    this.sessionTerminated = true;
  }

  getState(): Observable<RptlState> {
    return this.state;
  }
}


describe('SerProtocolService', () => {
  let mockedUnderlyingProtocol: MockedRptlProtocol;
  let service: SerProtocolService;

  beforeEach(() => {
    mockedUnderlyingProtocol = new MockedRptlProtocol(); // Mocks a new session for each unit test

    TestBed.configureTestingModule({
      providers: [
        { // Mocking for RPTL and WS connection layers, so sent/received messages can easily been checked for/simulated
          provide: RptlProtocolService,
          useValue: mockedUnderlyingProtocol
        }
      ]
    });

    service = TestBed.inject(SerProtocolService);
  });

  describe('constructor()', () => {
    it('should be created as unbound', () => {
      expect(service).toBeTruthy();
      expect(service.isBound()).toBeFalse();
    });

    it('should automatically bind service with SER subject and handle commands from server', () => {
      const services: Subject<string>[] = []; // Each subject get from a SER Service registration to simulates SE receiving and SR sending

      for (let i = 0; i < 3; i++) { // boundWith() call expected on service subjects
        services.push(service.register(`TestingService${i}`));
      }

      // Sends SR commands which will all be queued
      services[1].next('command 1');
      services[1].next('command 2');
      services[2].next('command 3');

      expect(mockedUnderlyingProtocol.serProtocol.nextCommand()).toBeUndefined(); // No commands should have been sent inside unbound state

      mockedUnderlyingProtocol.state.next(RptlState.REGISTERED); // Mocks server registration to go into RPTL registered mode
      expect(service.isBound()).toBeTrue(); // It should have bound automatically

      // Checks for Services to have been bound with boundWith() method
      expect(mockedUnderlyingProtocol.serProtocol.nextCommand()).toEqual('SERVICE REQUEST 0 TestingService1 command 1');
      expect(mockedUnderlyingProtocol.serProtocol.nextCommand()).toEqual('SERVICE REQUEST 1 TestingService1 command 2');
      expect(mockedUnderlyingProtocol.serProtocol.nextCommand()).toEqual('SERVICE REQUEST 2 TestingService2 command 3');
      expect(mockedUnderlyingProtocol.serProtocol.nextCommand()).toBeUndefined();

      let receivedEvent: string | undefined;
      services[0].subscribe({ // Expects SE commands pushed into SER protocol subject to be handled and received by SER Service
        next: (event: string) => receivedEvent = event,
        error: unexpected,
        complete: unexpected
      });

      // TestingService0 refers to 1st registered Service inside array
      mockedUnderlyingProtocol.serProtocol.handleCommand('EVENT TestingService0 a random event');

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent).toEqual('a random event'); // SE should have been received
    });

    it('should terminate RPTL session if an SER protocol level error occurs', () => {
      mockedUnderlyingProtocol.state.next(RptlState.REGISTERED); // Binds SER protocol service
      expect(service.isBound()).toBeTrue();

      mockedUnderlyingProtocol.serProtocol.handleCommand('I am an error.'); // Receiving an ill-formed SER command

      expect(mockedUnderlyingProtocol.sessionTerminated).toBeTrue(); // RPTL endSession() should have been called when error was caught
    });
  });

  describe('register()', () => {
    it('should throw if service name is already registered', () => {
      service.register('TestingService'); // Now registered
      expect(() => service.register('TestingService')).toThrowError(UnavailableServiceName); // Cannot be registered twice
    });

    // Normal registration case tested inside bind() successfully done unit test
  });

  describe('getErrors()', () => {
    it('should retrieve observable even inside unbound state', () => {
      service.getErrors().subscribe({ // Unbound state: no commands should be received, but observable should not complete
        next: unexpected,
        complete: unexpected,
        error: unexpected
      });

      expect().nothing();
    });

    it('should retrieve observable inside bound state', () => {
      service.getErrors().subscribe({ // Bound state, but no SRR KO commands were received
        next: unexpected,
        complete: unexpected,
        error: unexpected
      });

      expect().nothing();
    });
  });

  describe('Commands handling', () => {
    // Commands should only be received inside bound state
    beforeEach(() => mockedUnderlyingProtocol.state.next(RptlState.REGISTERED));

    it('should terminate session if SER command is neither EVENT nor RESPONSE', () => {
      mockedUnderlyingProtocol.serProtocol.handleCommand(''); // Empty SER command
      expect(mockedUnderlyingProtocol.sessionTerminated).toBeTrue();
    });

    describe('EVENT', () => {
      it('should terminate session if Service referred by SE command does not exist', () => {
        mockedUnderlyingProtocol.serProtocol.handleCommand('EVENT ThisServiceIsFake');
        expect(mockedUnderlyingProtocol.sessionTerminated).toBeTrue();
      });

      it('should call Service subject observers next() callback if SE command is received', () => {
        let lastEvent: string | undefined;
        // Mocking TestingService expecting to receive an event from server
        service.register('TestingService').subscribe({
          next: (event: string) => lastEvent = event,
          error: unexpected,
          complete: unexpected
        });

        // Receives from server a Service Event happening on TestingService
        mockedUnderlyingProtocol.serProtocol.handleCommand('EVENT TestingService    a random event');

        // Checks for next() callback to have been invoked with expected event
        expect(lastEvent).toBeDefined();
        expect(lastEvent).toEqual('a random event');
      });
    });

    describe('RESPONSE', () => {
      it('should terminate session if request UID was not waiting a response', () => {
        mockedUnderlyingProtocol.serProtocol.handleCommand('RESPONSE 0 OK');
        expect(mockedUnderlyingProtocol.sessionTerminated).toBeTrue();
      });

      it('should marks UID as done if response is OK', () => {
        // Sends a SR command to TestingService which will have request UID 0
        service.register('TestingService').next('a random request');
        mockedUnderlyingProtocol.serProtocol.handleCommand('RESPONSE 0 OK');
        expect(mockedUnderlyingProtocol.sessionTerminated).toBeFalse(); // Right request UID, no SER protocol error

        mockedUnderlyingProtocol.serProtocol.handleCommand('RESPONSE 0 OK'); // SER protocol error, 0 responded, should ne longer be waiting
        expect(mockedUnderlyingProtocol.sessionTerminated).toBeTrue(); // Expect error to have occurred as UID 0 should no longer be waiting
      });

      it('should marks UID as done if response is KO', () => {
        let serviceError: string | undefined;
        // Errors observable should never be stopped
        // Error should be received within SRR KO from server
        service.getErrors().subscribe({
          next: (errorMessage: string) => serviceError = errorMessage,
          error: unexpected,
          complete: unexpected
        });

        // Sends a SR command to TestingService which will have request UID 0
        service.register('TestingService').next('a random request');
        mockedUnderlyingProtocol.serProtocol.handleCommand('RESPONSE 0 KO        a random error');
        expect(mockedUnderlyingProtocol.sessionTerminated).toBeFalse(); // Right request UID, no SER protocol error

        mockedUnderlyingProtocol.serProtocol.handleCommand('RESPONSE 0 OK'); // SER protocol error, 0 responded, should ne longer be waiting
        expect(mockedUnderlyingProtocol.sessionTerminated).toBeTrue(); // Expect error to have occurred as UID 0 should no longer be waiting

        // Checks for errors next() callback to have been invoked by handleCommand() with error message received from server
        expect(serviceError).toBeDefined();
        expect(serviceError).toEqual('a random error');
      });
    });
  });
});
