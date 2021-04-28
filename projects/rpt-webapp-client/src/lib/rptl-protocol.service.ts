import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Actor } from './actor';
import { Availability } from './availability';
import { ArgumentScheme, CommandParser } from './command-parser';


/**
 * Thrown if requiring session to be run and there isn't any, or if the opposite is true.
 */
export class BadSessionState extends Error {
  /**
   * @param sessionShouldRun `true` if session should have been run to perform desired operation
   */
  constructor(sessionShouldRun: boolean) {
    super(sessionShouldRun ? 'Expected session to run' : 'Did not expect session to run');
  }
}


/**
 * Thrown if protocol mode (registered/unregistered) isn't appropriate to current operation.
 */
export class BadRptlMode extends Error {
  /**
   * @param shouldBeRegistered `true` if RPTL protocol mode should be registered to perform desired operation
   */
  constructor(shouldBeRegistered: boolean) {
    super(shouldBeRegistered ? 'Expected client to be registered' : 'Did not expect client to be registered');
  }
}


/**
 * Thrown if a received RPTL message is ill-formed.
 */
export class BadServerMessage extends Error {
  /**
   * @param reason Error explaining why message was ill-formed by server
   */
  constructor(reason: string) {
    super(reason);
  }
}


// Provides handler for a specific command invoked by server
type Handler = (parsedCommand: CommandParser) => void;
// Provides available commands and their handler for a specific RPTL Protocol mode
type CommandHandlers = { [command: string]: Handler };


/**
 * Implements RPTL protocol through its messaging interface which is a strings subject to send and receive RPTL messages.
 *
 * Provides observables to listen for the following updated values:
 * - Actors data if registered
 * - SER Protocol commands if registered
 * - Server availability if unregistered
 *
 * Provides access to registered actor data, if any, using `getActor()` method.
 *
 * @note SER commands observable is a subject to allow command sending
 *
 * @author ThisALV, https://github.com/ThisALV
 */
@Injectable({
  providedIn: 'root'
})
export class RptlProtocolService {
  /**
   * Subject used to send and receive SER Protocol commands.
   */
  serCommands: Subject<string>;

  // Handlers to call for eah command invoked by server on registered mode
  private readonly registeredCommandHandlers: CommandHandlers;
  // Same for unregistered mode
  private readonly unregisteredCommandHandlers: CommandHandlers;

  // RPTL protocol mode (registered/unregistered)
  private registeredMode: boolean;
  // Current actor owned by this client
  private selfActor?: Actor;
  // Updatable list of connected actors, initialized on registered mode
  private actors?: Subject<Actor[]>;
  // Current list of connected actors, provided to actors member each time it is updated
  private lastActorsValue: Actor[];
  // Updatable data about server availability, if it is possible to connect or if server is full
  private availability?: Subject<Availability>;
  // Subject used to send and receive message with a (potentially mocked) server
  private messagingInterface: Subject<string>;

  /**
   * Constructs service not connected to any server as unregistered RPTL protocol mode.
   */
  constructor() {
    this.serCommands = new Subject<string>();
    this.registeredMode = false;
    this.messagingInterface = new Subject<string>(); // Sending/receiving message when not connected does

    this.lastActorsValue = []; // Can be empty at initialization, doesn't matter because actors member isn't initialized yet
    this.serCommands.complete(); // No running session, no SER Command to retrieve
    this.messagingInterface.complete(); // No running session, no RPTL message to handle

    // Initalizes command handlers for each RPTL mode

    this.registeredCommandHandlers = {
      INTERRUPT: (parsedCommand: CommandParser) => this.handleInterruptCommand(parsedCommand),
      SERVICE: (parsedCommand: CommandParser) => this.handleServiceCommand(parsedCommand),
      LOGGED_IN: (parsedCommand: CommandParser) => this.handleLoggedInCommand(parsedCommand),
      LOGGED_OUT: (parsedCommand: CommandParser) => this.handleLoggedOutCommand(parsedCommand)
    };

    this.unregisteredCommandHandlers = {
      AVAILABILITY: (parsedCommand: CommandParser) => this.handleAvailabilityCommand(parsedCommand),
      REGISTRATION: (parsedCommand: CommandParser) => this.handleRegistrationCommand(parsedCommand)
    };
  }

  /**
   * Complete/error every subject depending on optional error argument
   *
   * @param error Message for session end error cause, if any
   * @private
   */
  private clearSession(error?: string): void {
    if (error) { // If error occurred
      const errorMessage: string = error as string;

      this.serCommands.error(errorMessage);
      this.messagingInterface.error(errorMessage);
      this.actors?.error(errorMessage);
      this.availability?.error(errorMessage);
    } else { // If terminated properly
      this.serCommands.complete();
      this.messagingInterface.complete();
      this.actors?.complete();
      this.availability?.complete();
    }
  }

  /**
   * Parses given message depending on current RPTL protocol mode.
   *
   * @param rptlMessage Message to handle
   * @private
   *
   * @throws BadServerMessage if received RPTL message was ill-formed by server
   */
  private handleMessage(rptlMessage: string): void {
    let parsedCommand: CommandParser;
    try {
      // Parses RPTL command name
      parsedCommand = new CommandParser(rptlMessage).parseTo([{ name: 'rptlCommand', type: String }]);
    } catch (err) { // Might fail, rethrows error if it is the case
      throw new BadServerMessage(err.message);
    }

    const invokedCommandName: string = parsedCommand.parsedData.rptlCommand;
    let invokedCommandHandler: Handler;

    // Available command handlers will depends on current RPTL protocol mode
    if (this.registeredMode) {
      invokedCommandHandler = this.registeredCommandHandlers[invokedCommandName];
    } else {
      invokedCommandHandler = this.unregisteredCommandHandlers[invokedCommandName];
    }

    if (invokedCommandHandler === undefined) { // If command was not found in handlers registry, then it isn't available
      throw new BadServerMessage(`Unavailable command: ${invokedCommandName}`);
    }

    invokedCommandHandler(parsedCommand);
  }

  private handleInterruptCommand(parsedCommand: CommandParser): void {
    if (parsedCommand.unparsed.length === 0) {
      this.clearSession();
    } else { // If any error message argument is provided, then dispatch error too
      this.clearSession(parsedCommand.unparsed);
    }
  }

  private handleServiceCommand(parsedCommand: CommandParser): void {
    // Provides RPTL command argument which is an RPTL command to SER Protocol subject
    this.serCommands.next(parsedCommand.unparsed);
  }

  private handleLoggedInCommand(parsedCommand: CommandParser): void {
    // Parses LOGGED_IN <uid> <name> arguments to know about new actor data
    let parsedArguments: CommandParser;
    try {
      parsedArguments = parsedCommand.parseTo([
        { name: 'uid', type: Number }, { name: 'name', type: String }
      ]);
    } catch (err) {
      throw new BadServerMessage(err.message);
    }

    // Actor who just logged on
    const newActor: Actor = new Actor(parsedArguments.parsedData.uid, parsedArguments.parsedData.name);

    // If just registered, it might be our own actor. In this case it must be ignored.
    if (newActor.uid !== this.selfActor?.uid) {
      // Pushes parsed actor data to last actors value
      this.lastActorsValue.push();
      // Then update subject with that value
      this.actors?.next(this.lastActorsValue);
    }
  }

  private handleLoggedOutCommand(parsedCommand: CommandParser): void {
    // Parses uid argument to known which actor just logged out
    let parsedArguments: CommandParser;
    try {
      parsedArguments = parsedCommand.parseTo([{ name: 'uid', type: Number }]);
    } catch (err) {
      throw new BadServerMessage(err.message);
    }

    // Keep each actor which hasn't UID of the logged out one
    this.lastActorsValue = this.lastActorsValue.filter((actor: Actor) => actor.uid !== parsedArguments.parsedData.uid);
    // Then update subject with new value
    this.actors?.next(this.lastActorsValue);
  }

  private handleAvailabilityCommand(parsedCommand: CommandParser): void {
    // Parses actors_count and max_actors_number arguments
    let parsedArguments: CommandParser;
    try {
      parsedArguments = parsedCommand.parseTo([
        { name: 'actorsCount', type: Number }, { name: 'maxActorsNumber', type: Number }
      ]);
    } catch (err) {
      throw new BadServerMessage(err.message);
    }

    // Updates subject with new received server status
    this.availability?.next(new Availability(parsedArguments.parsedData.actorsCount, parsedArguments.parsedData.maxActorsNumber));
  }

  private handleRegistrationCommand(parsedCommand: CommandParser): void {
    // Reset last value for actors list subject
    this.lastActorsValue = [];

    // Parses each connected actor, begging with all RPTL command arguments
    let currentParsedActor: CommandParser = parsedCommand;
    // While there is still arguments to parse, tries to parse next already connected actor
    let currentArgumentsSuffix = 0;
    while (currentParsedActor.unparsed.length !== 0) {
      // Actor arguments pair for current actor inside REGISTRATION command, with appropriate suffix
      const currentUidArgument = `uid${currentArgumentsSuffix}`;
      const currentNameArgument = `name${currentArgumentsSuffix}`;
      const currentActorArgumentsScheme: ArgumentScheme[] = [
        { name: currentUidArgument, type: Number }, { name: currentNameArgument, type: String }
      ];

      currentArgumentsSuffix++; // Next arguments pair must have a different name

      try {
        // Takes 2 next arguments, then prepares to parse for next actor with reassignment
        currentParsedActor = currentParsedActor.parseTo(currentActorArgumentsScheme);
      } catch (err) {
        throw new BadServerMessage(err.message);
      }

      // Pushes just parsed connected actor
      this.lastActorsValue.push(new Actor(
        currentParsedActor.parsedData[currentUidArgument], currentParsedActor.parsedData[currentNameArgument]
      ));
    }

    // Initializes connected actors subject as client has just been registered with that confirmation message
    this.actors = new Subject<Actor[]>();
    // It would be useless to updated new value into subject now: as registered mode hasn't been toggled, no one is currently
    // subscribed to it.

    // Finally, set registered mode for RPTL Protocol
    this.registeredMode = true;
  }

  /**
   * Sends given message.
   *
   * @param rptlMessage Message to send
   * @private
   */
  private sendMessage(rptlMessage: string): void {
    console.log(`Send message: ${rptlMessage}`);
    this.messagingInterface.next(rptlMessage);
  }

  /**
   * Resets RPTL protocol state to begin new session on given connection.
   *
   * @param connection RPTL messages stream for this session
   *
   * @throws BadSessionState if session is already running
   */
  beginSession(connection: Subject<string>): void {
    if (!this.messagingInterface.isStopped) { // Checks if session isn't already running
      throw new BadSessionState(false);
    }

    // Reset state
    this.registeredMode = false;
    this.actors = undefined;
    this.availability = new Subject<Availability>();

    // Listen and send RPTL messages from new session connection
    this.messagingInterface = connection;

    const context: RptlProtocolService = this;
    connection.subscribe({
      next(rptlMessage: string): void { // Handle every received message
        console.log(`Recv message: ${rptlMessage}`);

        try { // Tries to handle received RPTL message
          context.handleMessage(rptlMessage);
        } catch (err) { // Error may occurs during message handling, in case of a protocol error, stop current session
          console.error(`Message handling failed: ${err}`);
          context.clearSession(err.toString());
        }
      },

      error(err: { code: number, reason?: string }): void { // Any connection error is fatal and must stop current session
        const errMessage = `${err.code}: ${err.reason}`;

        console.error(`Session error: ${errMessage}`);
        context.clearSession(errMessage);
      },

      complete(): void { // Stop current session if connection was closed
        console.log('Session end');
        context.clearSession();
      }
    });
  }

  /**
   * Properly logout from server using RPTL logout command if registered, closing directly the messaging interface otherwise.
   *
   * Connection should be closed by server after this call.
   *
   * @throws BadSessionState If no session is currently running
   */
  endSession(): void {
    if (this.messagingInterface.isStopped) { // Checks if a session is run using RPTL messages subject state
      throw new BadSessionState(true);
    }

    if (this.registeredMode) {
      this.sendMessage('LOGOUT');
    } else {
      this.clearSession(); // User requested end, no error provided
    }
  }

  /**
   * @returns Updated list of registered actors or error with message property on unregistered mode
   *
   * @note Observable subject value might be updated even if no modification has been done to the actors list.
   * @note Observable has no value at subscription, all `updateActorsSubscribers()` to next current actors list into every subscribable
   * following actors list.
   */
  getActors(): Observable<Actor[]> {
    if (this.registeredMode) { // Must be registered to see other registered actors
      return this.actors as Observable<Actor[]>; // this.actors always defined inside registered mode
    } else {
      const error: Subject<Actor[]> = new Subject();
      error.error({ message: 'Unable to get actors inside unregistered mode' });

      return error;
    }
  }

  /**
   * Next (= push) current actors list into every subscribable following actors list even if list hasn't changed since last nexted value.
   *
   * @throws BadSessionState if session isn't running
   * @throws BadRptlMode if connected client isn't registered
   */
  updateActorsSubscribable(): void {
    if (this.messagingInterface.isStopped) { // Checks for session to be running
      throw new BadSessionState(true);
    }

    if (!this.registeredMode) { // Checks for client to be into registered RPTL mode
      throw new BadRptlMode(true);
    }

    // If connected and registered, pushes current actors list
    this.actors?.next(this.lastActorsValue);
  }

  /**
   * @returns Updated stats about server availability (if it is full or not), or error if registered mode or if no session has begun
   */
  getStatus(): Observable<Availability> {
    // Must be unregistered but with running session to check for server status
    if (!this.registeredMode && !this.messagingInterface.isStopped) {
      return this.availability as Observable<Availability>;
    } else {
      const error: Subject<Availability> = new Subject<Availability>();

      let errorMessage: string;
      if (this.messagingInterface.isStopped) { // Error message depends on which precondition isn't true
        errorMessage = 'Unable to check for status without any session';
      } else {
        errorMessage = 'Unable to check for status if already registered';
      }

      error.error({ message: errorMessage });

      return error;
    }
  }

  /**
   * Sends an RPTL checkout command to server to status will be updated and new value nexted into every status subscribable.
   *
   * @throws BadSessionState if session isn't running
   * @throws BadRptlMode if connected client is not into unregistered RPTL mode
   */
  updateStatusFromServer(): void {
    if (this.messagingInterface.isStopped) { // Checks for session to be running
      throw new BadSessionState(true);
    }

    if (this.registeredMode) { // Checks for client to not be registered
      throw new BadRptlMode(false);
    }

    // Sends CHECKOUT command to get AVAILABILITY response from server
    this.messagingInterface.next('CHECKOUT');
  }

  /**
   * @returns Data for actor owned by this client
   *
   * @throws BadRptlMode if client isn't registered yet
   */
  getSelf(): Actor {
    if (!this.registeredMode) { // Checks for client to be registered
      throw new BadRptlMode(true);
    }

    return this.selfActor as Actor;
  }

  /**
   * Sends a registration message using given actor data for registration arguments and initialized client owned actor.
   *
   * @param uid UID used by this client actor
   * @param name Name used by this client actor
   *
   * @throws BadSessionState if session isn't running
   * @throws BadRptlMode if connected client is already registered
   */
  register(uid: number, name: string): void {
    if (this.messagingInterface.isStopped) { // Checks for session to be running
      throw new BadSessionState(true);
    }

    if (this.registeredMode) { // Checks for client to not be registered yet
      throw new BadRptlMode(false);
    }

    // Saves client own actor right now has it will not be repeated by the server
    this.selfActor = new Actor(uid, name);

    // Formats and send RPTL registration command
    this.sendMessage(`LOGIN ${uid} ${name}`);
  }
}
