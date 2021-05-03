import { Injectable } from '@angular/core';
import { RptlProtocolService } from './rptl-protocol.service';
import { Subject } from 'rxjs';
import { CommandParser } from './command-parser';
import { ServiceSubject } from './service-subject';
import { ServiceContext } from './service-context';
import { ServiceRequestResponse } from './service-request-response';


/**
 * Thrown by `SerProtocolService:register()` if given service name is already registered.
 */
export class UnavailableServiceName extends Error {
  /**
   * @param alreadyUsedName Service name which is unavailable
   */
  constructor(alreadyUsedName: string) {
    super(`Service name ${alreadyUsedName} is already registered`);
  }
}


/**
 * Thrown by `SerProtocolService` methods when invoked into inappropriate state.
 */
export class BadSerState extends Error {
  /**
   * @param shouldBeBound `true` if service should have been bound to perform this action, `false` otherwise
   */
  constructor(shouldBeBound: boolean) {
    super(shouldBeBound ? 'Expected SER protocol bound to underlying RPTL protocol' : 'Did not expect SER protocol to be bound yet');
  }
}


/**
 * Thrown by `SerProtocolService` methods when received SER command is ill-formed.
 */
export class BadSerCommand extends Error {
  /**
   * @param reason Message explaining why received command was ill-formed
   */
  constructor(reason: string) {
    super(`Bad SER command: ${reason}`);
  }
}


/**
 * Implements SER Protocol over injected RPTL protocol.
 *
 * A SER Protocol service instance is constructed as not bound. When RPTL protocol client is registered, `bind()` call is expected to
 * listen for `SERVICE` commands emitted by server and to allow sending SER commands to server.
 *
 * For a SER service to use SER Protocol, an instance of this Angular service must be injected into Angular service of required SER
 * service. At construction, SER service (implemented with an Angular service) must call `register()` with service name passed as
 * argument, so it will be able to send SR commands and receive SE commands for it when SER protocol instance is into bound state.
 *
 * Unbound is automatically done as soon as underlying RPTL protocol switches to unregistered mode.
 */
@Injectable({
  providedIn: 'root',
})
export class SerProtocolService {
  // SER services registry, with an underlying subject to listen for SE event from corresponding service
  private readonly services: { [name: string]: ServiceSubject };
  // Context given to each service so they can access an available UID for their generated Service Request commands
  private readonly context: ServiceContext;
  // Subject for every non-fatal error (errors due to KO SRR commands)
  private readonly errors: Subject<string>;

  // Into bound state, a SER Protocol instance is owning a strings subject to send and received SER commands which will be parsed by
  // this Angular service
  // Into unbound state, subject is stopped
  private commands: Subject<string>;

  constructor(private readonly underlyingProtocol: RptlProtocolService) {
    this.services = {}; // No registered services at construction
    this.context = new ServiceContext();
    this.errors = new Subject<string>();
    this.commands = new Subject<string>();

    // At construction, state is unbound, so no matter if subject is truth or mocked, it only needs to be stopped
    this.commands.complete();
  }

  private handleCommand(serCommand: string): void {
    // Parses SER command name, from server it can be either EVENT or RESPONSE
    const parsedSerCommand: CommandParser = new CommandParser(serCommand).parseTo([{ name: 'serCommandType', type: String }]);

    switch (parsedSerCommand.parsedData.serCommandType) {
      case 'EVENT': // Service Event command
        // Parses involved service
        const parsedServiceEvent: CommandParser = parsedSerCommand.parseTo([{ name: 'service', type: String }]);
        const target: string = parsedServiceEvent.parsedData.service;
        // If this service doesn't exist, its subject will not, so it will be undefined...
        const serviceEventsSubject: ServiceSubject | undefined = this.services[target];

        if (serviceEventsSubject === undefined) { // ...in that case, there is an error
          throw new BadSerCommand(`Service ${target} does not exist`);
        }

        serviceEventsSubject.fire(parsedServiceEvent.unparsed); // If service exists, notifies it about the Service command inside SE

        break;
      case 'RESPONSE': // Service Request Response command
        // Parses which SR this SRR is responding to, and if it has succeed or not with string-convert type ServiceRequestResponse
        const parsedRequestResponse: CommandParser = parsedSerCommand.parseTo([
          { name: 'requestUid', type: Number }, { name: 'response', type: ServiceRequestResponse }
        ]);

        this.context.done(parsedRequestResponse.parsedData.requestUid);

        // Errors must be handled by client
        if (!parsedRequestResponse.parsedData.response.isSucceed()) {
          // The remaining part of a SRR command is an optional error message
          this.errors.next(parsedRequestResponse.unparsed);
        }

        break;
      default: // Throws a BadSerCommand as only EVENT and RESPONSE are allowed
        throw new BadSerCommand(`Unknown command type: ${parsedSerCommand.parsedData.serCommandType}`);
    }
  }

  /**
   * @returns `true` is instance is bound, `false` otherwise
   */
  isBound(): boolean {
    return !this.commands.isStopped; // A bound instance is owning an active (non-stopped) subject to send and receive SER commands
  }

  /**
   * Sets Angular service to bound state, where it listens for SE and SRR commands, and sends SR commands to server.
   *
   * @throws BadSerState if already bound
   */
  bind(): void {
    if (this.isBound()) {
      throw new BadSerState(false);
    }

    this.commands = this.underlyingProtocol.getSerProtocol(); // Bound, must initialize commands subject

    for (const registeredService in this.services) { // A new SER protocol subject is available, receive/send from/to it for services
      if (this.services.hasOwnProperty(registeredService)) { // Checks if it is an expected dictionary property, not a built-in one
        this.services[registeredService].boundWith(this.commands);
      }
    }

    const context: SerProtocolService = this;
    // Completion will sets this subject as stopped, which is putting this instance into unbound state as Service will queues outgoing SR
    // and will no longer receive any SE or SRR commands
    this.commands.subscribe({
      next(serCommand: string): void { // For each RPTL messages invoking SERVICE command
        try {
          context.handleCommand(serCommand);
        } catch (err: any) { // Any error at SER protocol level (not at Service level) is fatal
          context.underlyingProtocol.endSession();
        }
      }
    });
  }

  /**
   * Makes SER protocol listening for events and sending request for service designated with given name.
   *
   * @param serviceName Identifier for service to register
   *
   * @returns A subject to send and formats SR command with next() method, and to receive parsed SE events with next() *callback*
   *
   * @throws UnavailableServiceName if `serviceName` is already registered
   */
  register(serviceName: string): Subject<string> {
    if (this.services[serviceName] !== undefined) { // Checks for given name to be available
      throw new UnavailableServiceName(serviceName);
    }

    const newServiceSubject: ServiceSubject = new ServiceSubject(this.context, serviceName, this.commands);
    this.services[serviceName] = newServiceSubject; // Makes an entry into registry so it is able to receive SE commands

    return newServiceSubject; // Gives access to next() method so it is able to send SR commands
  }

  /**
   * @returns Subject calling next() callbacks for each KO-responded Service Request.
   */
  getErrors(): Subject<string> {
    return this.errors;
  }
}
