import { ObjectUnsubscribedError, Subject } from 'rxjs';
import { ServiceContext } from './service-context';


/**
 * Wrapper for `SerProtocolSubject`, allowing to send Service Requests and receive Service Events to/from a specific service.
 *
 * If `SerProtocolService` owning a subject isn't into bound state, subject is still available, but it will not receive any SE and sent
 * SR will be queued to be sent as soon as `bind()` is called. Basically, a Service Request cannot complete and isn't stopped when it is
 * errored.
 */
export class ServiceSubject extends Subject<string> {
  // Messages to send as soon as underlying SER protocol is no longer a stopped subject
  private serviceRequestsQueue: string[];

  /**
   * @param context Context for all Services running inside this session, providing UID for Service Requests
   * @param serviceName Service emitting event and modified with sent requests
   * @param commands Subject used to send formatted Service Request commands
   */
  constructor(private context: ServiceContext, private serviceName: string, private commands: Subject<string>) {
    super();

    this.serviceRequestsQueue = []; // No messages to send at construction
  }

  /**
   * Flushes current SR commands queue into new subject.
   *
   * @param commands New subject used to send formatted Service Request commands
   */
  boundWith(commands: Subject<string>): void {
    this.commands = commands; // Set a new subject provided by a new RPTL session

    for (const queuedRequest of this.serviceRequestsQueue) { // In FIFO order, send each queued message
      this.next(queuedRequest); // next() will queue them back if subject is stopped
    }

    this.serviceRequestsQueue = []; // Queue is flushed
  }

  /**
   * @param request SR command to send into subject service, queued if SER protocol isn't bound
   *
   * @note If SR command sending fails for unexpected reasons, error() subscribers method will be called.
   *
   * @throws ObjectUnsubscribedError if subject was unsubscribed
   * @throws Error if command is `undefined`
   */
  next(request?: string): void {
    if (request === undefined) {
      throw new Error('Service Request is undefined');
    }

    if (this.closed) { // Checks for subject to not have been unsubscribed
      throw new ObjectUnsubscribedError();
    }

    if (this.commands.isStopped) { // Queues message if it cannot be sent for now
      this.serviceRequestsQueue.push(request);
    } else {
      // UID used for this Service Request command, provided by context for all running SER services
      const serviceRequestUid: number = this.context.generateServiceRequestUid();

      try {
        // Cannot be stopped, in any case, formats and sends Service Request
        this.commands.next(`REQUEST ${serviceRequestUid} ${this.serviceName} ${request}`);
      } catch (err: any) { // A non-stopping error will emits if request couldn't have been sent
        this.context.done(serviceRequestUid); // Sending failed, should not wait for a response
        this.error(err);
      }
    }
  }

  /**
   * Call error() callbacks for every subscribers WITHOUT stopping the subject.
   *
   * @param err Object having a `message` string member
   */
  error(err: any): void {
    if (this.closed) { // Checks for subject to not have been unsubscribed
      throw new ObjectUnsubscribedError();
    }

    // In any case, call appropriate callbacks without stopping the subject
    for (const subscriber of this.observers) {
      subscriber.error(err);
    }
  }

  /**
   * @throws Error because this operation isn't supported for that kind of subject
   */
  complete(): void {
    throw new Error('Service subjects are not completable');
  }

  /**
   * Calls subscribers next() method with given received Service Event command.
   *
   * @param event Formatted SE command
   */
  fire(event: string): void {
    super.next(event);
  }
}

