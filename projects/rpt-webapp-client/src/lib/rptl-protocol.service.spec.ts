import { TestBed } from '@angular/core/testing';
import { expectToBeErrored, expectToContainExactly, MockedWebsocketSubject, unexpected } from './testing-helpers';
import { BadConnectionSubject, BadRptlMode, BadSessionState, RptlProtocolService, RptlState } from './rptl-protocol.service';
import { Subject } from 'rxjs';
import { Actor } from './actor';
import { Availability } from './availability';


/**
 * Boolean which can be returned then modified into callbacks called from function which returned it.
 */
class SharedBoolean {
  value: boolean;

  constructor() {
    this.value = false;
  }
}


describe('RptlProtocolService', () => {
  let service: RptlProtocolService;
  let mockedWsConnection: MockedWebsocketSubject;

  /**
   * Expects `service` to switch state into given `RtplState`.
   *
   * @param expectedState `RptlState` RPTL protocol must switch into
   *
   * @returns `value` field assigned to `true` when a new state has been pushed, expected or not
   */
  function expectStateToBeUpdated(expectedState: RptlState): SharedBoolean {
    const updated: SharedBoolean = new SharedBoolean();

    service.getState().subscribe({
      next: (newState: RptlState): void => { // Expects a new value to be pushed
        updated.value = true; // next() has been called
        expect(newState).toEqual(expectedState);
      },

      error: unexpected,
      complete: unexpected
    });

    return updated;
  }

  /**
   * Expects `getState()` observers to not handle any `RptlState` value.
   */
  function expectStateToNotBeUpdated(): void {
    service.getState().subscribe({
      next: unexpected,
      error: unexpected,
      complete: unexpected
    });
  }

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

    it('should run session and notify new state if it is not already running', () => {
      const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.UNREGISTERED);

      expect(() => service.beginSession(mockedWsConnection)).not.toThrow();
      expect(service.isSessionRunning()).toBeTrue();
      expect(hasNotifiedState.value).toBeTrue(); // State must have been updated, so new state value has already been checked
    });

    it('should throw if session is already running', () => {
      service.beginSession(mockedWsConnection); // Puts session into running state
      expect(() => service.beginSession(mockedWsConnection)).toThrowError(BadSessionState); // Already running
      expect(service.isSessionRunning()).toBeTrue(); // Should not have stopped current session
    });

    it('should stop session and notify new state when connection is completed', () => {
      service.beginSession(mockedWsConnection);
      expect(service.isSessionRunning()).toBeTrue();

      // RPTL state is now unregistered and should switch back to disconnected
      const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.DISCONNECTED);

      mockedWsConnection.complete();
      expect(service.isSessionRunning()).toBeFalse();
      expect(hasNotifiedState.value).toBeTrue();
    });

    it('should stop session and notify new state when connection is errored', () => {
      service.beginSession(mockedWsConnection);
      expect(service.isSessionRunning()).toBeTrue();

      // RPTL state is now unregistered and should switch back to disconnected
      const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.DISCONNECTED);

      mockedWsConnection.error({ message: 'A random error' });
      expect(service.isSessionRunning()).toBeFalse();
      expect(hasNotifiedState.value).toBeTrue(); // State must have been updated, so new state value has already been checked
    });
  });

  describe('endSession()', () => {
    it('should throw if session is not running', () => {
      expect(() => service.endSession()).toThrowError(BadSessionState);
    });

    it('should send logout command into registered mode', () => {
      service.beginSession(mockedWsConnection);
      mockRegistration();

      // RPTL state is now registered, registration already happen and no update on state should happen since now
      expectStateToNotBeUpdated(); // LOGOUT command is sent to wait for `INTERRUPT` from server, should not disconnect immediately

      expect(() => service.endSession()).not.toThrow();
      expect(service.isSessionRunning()).toBeTrue(); // Session should still be running, waiting for server to close connection

      mockedWsConnection.nextMessage(); // Registration has sent one message, ignores it to test logout command message
      expect(mockedWsConnection.nextMessage()).toEqual('LOGOUT'); // Checks for command to have been sent
    });

    it('should stop session into unregistered mode', () => {
      service.beginSession(mockedWsConnection);

      // RPTL state is now registered, registration already happen and next state should be disconnection with endSession() call
      const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.DISCONNECTED);

      expect(() => service.endSession()).not.toThrow();
      expect(service.isSessionRunning()).toBeFalse(); // Unregistered, connection should be closed immediately
      // Checks for close frame sent by client, as client should have initiated disconnection because it wasn't registered
      expect(mockedWsConnection.closureReason).toBeDefined();
      expect(mockedWsConnection.closureReason).toEqual({ code: 1000 });
      expect(hasNotifiedState.value).toBeTrue(); // State must have been updated to DISCONNECTED as endSession() closed connection
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
      expectToContainExactly(actors as Actor[], new Actor(42, 'ThisALV'), new Actor(0, 'Redox'));
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
        next: unexpected,
        error: unexpected,
        complete: unexpected
      });

      expect().nothing(); // No handler should have been called on SER Protocol subject, as it is still open and nothing was done
    });
  });

  describe('getSelf()', () => {
    it('should throw if session is not running', () => {
      expect(() => service.getSelf()).toThrowError(BadSessionState);
    });

    it('should throw if session is running into unregistered mode', () => {
      service.beginSession(mockedWsConnection);

      expect(() => service.getSelf()).toThrowError(BadRptlMode);
    });

    it('should retrieve client own actor if registered mode', () => {
      service.beginSession(mockedWsConnection);
      mockRegistration(); // Client own actor is [42] ThisALV

      expect(service.getSelf()).toEqual(new Actor(42, 'ThisALV'));
    });
  });

  describe('register()', () => {
    it('should throw if session is not running', () => {
      expect(() => service.register(42, 'ThisALV')).toThrowError(BadSessionState);
    });

    it('should throw if session is already running into registered mode', () => {
      service.beginSession(mockedWsConnection);
      mockRegistration();

      expect(() => service.register(42, 'ThisALV')).toThrowError(BadRptlMode);
    });

    it('should send handshake command if session is running into unregistered mode', () => {
      service.beginSession(mockedWsConnection);

      // RPTL state is now unregistered, it should ne longer be updated
      expectStateToNotBeUpdated(); // Handshake command has been sent, waiting for server REGISTRATION command to enter registered mode

      expect(() => service.register(42, 'ThisALV')).not.toThrow(); // Registration should be done successfully
      expect(mockedWsConnection.nextMessage()).toEqual('LOGIN 42 ThisALV'); // Checks for command sent by client
    });
  });

  describe('Command handlers', () => {
    // RPTL protocol messages sending/receiving requires a session to be running with an active connection
    beforeEach(() => service.beginSession(mockedWsConnection));

    it('should handle registered-only commands into registered mode', () => {
      mockRegistration(); // Puts session into registered mode

      // AVAILABILITY command allowed into registered mode, client will disconnect from server because RPTL Protocol errors are fatal
      mockedWsConnection.fromServer('AVAILABILITY random arguments');

      expect(service.isSessionRunning()).toBeFalse();
      // Checks for close frame sent by client, as exception should have been caught by next() callback
      expect(mockedWsConnection.closureReason).toBeDefined();
      expect(mockedWsConnection.closureReason).toEqual({ code: 1011, reason: 'Unavailable command: AVAILABILITY' });
    });

    it('should handle unregistered-only commands into unregistered mode', () => {
      // Keeps session into unregistered

      // SERVICE command not allowed into unregistered mode, client will disconnect from server because RPTL Protocol errors are fatal
      mockedWsConnection.fromServer('SERVICE random command');

      expect(service.isSessionRunning()).toBeFalse();
      // Checks for close frame sent by client, as exception should have been caught by next() callback
      expect(mockedWsConnection.closureReason).toBeDefined();
      expect(mockedWsConnection.closureReason).toEqual({ code: 1011, reason: 'Unavailable command: SERVICE' });
    });

    describe('Registered mode', () => {
      // Registered-only commands require client to be registered
      beforeEach(() => mockRegistration());

      describe('INTERRUPT with Websocket close frame from server', () => {
        let serProtocol: Subject<string>;

        // SER subject is required to check for session to have been completed or errored
        beforeEach(() => serProtocol = service.getSerProtocol());

        it('should clear session with error if message is provided and notify new state', () => {
          const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.DISCONNECTED);

          mockedWsConnection.fromServer('INTERRUPT   An error occurred'); // Emulates interruption from server with an error message
          mockedWsConnection.closeFromServer(); // Emulates WS close frame from server, no matter the reason

          let connectionClosed = false;
          mockedWsConnection.subscribe({ // complete() call is expected as connection has been closed by server
            next: unexpected,
            error: unexpected,
            complete: () => connectionClosed = true
          });

          let sessionError: { message: string } | undefined;
          serProtocol.subscribe({ // Only expects session to be errored with INTERRUPT option argument
            next: unexpected,
            error: (err: any) => sessionError = err,
            complete: unexpected
          });

          expect(service.isSessionRunning()).toBeFalse(); // Session state should have been updated
          expect(connectionClosed).toBeTrue();
          expect(sessionError).toEqual({ message: 'An error occurred' }); // Closed because of an internal error
          expect(mockedWsConnection.closureReason).toBeUndefined(); // Closed by server, no client-side close frame expected

          // INTERRUPT command means closing connection, so complete/error calls clearSession() which notifies new state
          expect(hasNotifiedState.value).toBeTrue();
        });

        it('should clear session normally if message is not provided and notify new state', () => {
          const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.DISCONNECTED);

          mockedWsConnection.fromServer('INTERRUPT'); // Emulates interruption from server without any error message
          mockedWsConnection.closeFromServer(); // Emulates WS close frame from server, no matter the reason

          let connectionClosed = false;
          mockedWsConnection.subscribe({ // complete() call is expected as connection has been closed by server
            next: unexpected,
            error: unexpected,
            complete: () => connectionClosed = true
          });

          let sessionCompleted = false;
          serProtocol.subscribe({ // Only expects session to be completed
            next: unexpected,
            error: unexpected,
            complete: () => sessionCompleted = true
          });

          expect(service.isSessionRunning()).toBeFalse(); // Session state should have been updated
          expect(connectionClosed).toBeTrue();
          expect(sessionCompleted).toBeTrue(); // Closed because of a regular client disconnection
          expect(mockedWsConnection.closureReason).toBeUndefined(); // Closed by server, no client-side close frame expected

          // INTERRUPT command means closing connection, so complete/error calls clearSession() which notifies new state
          expect(hasNotifiedState.value).toBeTrue();
        });
      });

      describe('SERVICE', () => {
        it('should pass given command to SER Protocol subject', () => {
          let serviceCommand: string | undefined;
          service.getSerProtocol().subscribe({ // Protocol should not be closed, just receive a SER command
            next: (receivedCommand: string) => serviceCommand = receivedCommand,
            error: unexpected,
            complete: unexpected
          });

          mockedWsConnection.fromServer('SERVICE any command! !'); // Emulates a random SER command from server

          expect(serviceCommand).toBeDefined(); // A value should have been passed to SER Protocol subject
          expect(serviceCommand).toEqual('any command! !');
        });
      });

      describe('LOGGED_IN', () => {
        it('should update list with new actor if it is different from self', () => {
          let actorsList: Actor[] | undefined;
          service.getActors().subscribe({ // Session should not stop, next() call expected
            next: (newActorsList: Actor[]) => actorsList = newActorsList,
            error: unexpected,
            complete: unexpected
          });

          mockedWsConnection.fromServer('LOGGED_IN  8   Lait2Vache'); // Emulates a new remote actor [8] Lait2Vache

          expect(actorsList).toBeDefined(); // Actors list should have been updated
          // Checks for list content
          expectToContainExactly(actorsList as Actor[],
            new Actor(42, 'ThisALV'), new Actor(0, 'Redox'), new Actor(8, 'Lait2Vache')
          );
        });

        it('should not update list if new actor is same than self', () => {
          service.getActors().subscribe({ // No update should occur
            next: unexpected,
            error: unexpected,
            complete: unexpected
          });

          // Emulates message sent by server right after REGISTRATION command from it
          // This message is broadcast to every actor, so client actor is notified about its own registration, then it should ignore it
          mockedWsConnection.fromServer('  LOGGED_IN   42 ThisALV');

          expect().nothing(); // Command should be ignored, nothing should happen
        });
      });

      describe('LOGGED_OUT', () => {
        it('should update list without actor having received uid', () => {
          let actorsList: Actor[] | undefined;
          service.getActors().subscribe({ // Session should not stop, next() call expected
            next: (newActorsList: Actor[]) => actorsList = newActorsList,
            error: unexpected,
            complete: unexpected
          });

          mockedWsConnection.fromServer('LOGGED_OUT 0'); // Emulates a disconnection from Redox

          expect(actorsList).toBeDefined(); // Actors list should have been updated
          // Checks for list content
          expectToContainExactly(actorsList as Actor[], new Actor(42, 'ThisALV'));
        });
      });
    });

    describe('Unregistered mode', () => {
      // Keeps session into unregistered RPTL mode

      describe('AVAILABILITY', () => {
        it('should push new server status into observable', () => {
          let serverStatus: Availability | undefined;
          service.getStatus().subscribe({ // Expect for a new status to be pushed, listen before status update actually happens
            next: (newStatus: Availability) => serverStatus = newStatus,
            error: unexpected,
            complete: unexpected
          });

          mockedWsConnection.fromServer('AVAILABILITY 4 5'); // Updates server status

          expect(serverStatus).toEqual(new Availability(4, 5)); // Checks for correct status to have been assigned
        });
      });

      describe('REGISTRATION', () => {
        it('should notify new state, add all received actors to list and complete status observable', () => {
          const hasNotifiedState: SharedBoolean = expectStateToBeUpdated(RptlState.REGISTERED);

          let statusCompleted = false;
          service.getStatus().subscribe({ // Expect observable to be completed() as RPTL mode will be set to registered
            next: unexpected,
            error: unexpected,
            complete: () => statusCompleted = true
          });

          mockedWsConnection.fromServer('  REGISTRATION  42 ThisALV   0  Redox 8   Lait2Vache  ');

          let actorsList: Actor[] | undefined;
          service.getActors().subscribe({ // Expect actors list to contain all actors provided inside command arguments
            next: (updatedList: Actor[]) => actorsList = updatedList,
            error: unexpected,
            complete: unexpected
          });

          service.updateActorsSubscribable(); // Actors list must have a value

          expect(service.isRegistered()).toBeTrue(); // Checks for current RPTL mode
          expect(statusCompleted).toBeTrue(); // Checks for unregistered-only observables to have completed
          expect(actorsList).toBeDefined(); // Value must have been pushed
          // Checks for list content
          expectToContainExactly(actorsList as Actor[],
            new Actor(42, 'ThisALV'), new Actor(0, 'Redox'), new Actor(8, 'Lait2Vache')
          );

          // REGISTRATION command is actually confirming client registration, registered mode entered
          expect(hasNotifiedState.value).toBeTrue();
        });
      });
    });
  });
});
