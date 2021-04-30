import {} from 'jasmine'; // Required to use fail() declared by Jasmine
import { ObjectUnsubscribedError, Observable, Subject } from 'rxjs';


/**
 * Mocking for `WebSocketSubject` form rxjs, consisting in a Subject which next() method does not call observers next() member, and two
 * new methods `fromServer()` and `nextMessage()` which respectively call observers next() with a message from server and poll the next
 * message sent by the client.
 *
 * error() and complete() emulates a connection close frame, so complete() observers method is called no matter if error occurred or not.
 */
export class MockedWebsocketSubject extends Subject<string> {
  /**
   * Reason for connection to have been closed, if it has been closed by client (not by server)
   */
  closureReason?: { code: number, reason?: string };

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
   * Closes connection mock with given reason. It will complete this subject normally and saves the error code into `closureReason` field.
   *
   * @param err Error code, with required number field `code` and optional string field `reason`
   */
  error(err: any): void {
    this.closureReason = err; // Saves error reason to check for it later
    super.complete();
  }

  /**
   * Closes connection mock normally. It will complete this subject normally and saves the no error code into `closureReason` field.
   */
  complete(): void {
    this.closureReason = {code: 1000}; // No error occurred
    super.complete();
  }

  /**
   * Emulates a WebSocket close frame (error or not) from server by completing this subject normally and leaving `closureReason` undefined.
   */
  closeFromServer(): void {
    super.complete();
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


export function unexpected(): void {
  fail('Unexpected Observable state');
}


/**
 * Expects that only error() callback of subscriber for given observable will be called.
 *
 * @param observable Observable to check state for
 * @param routine Routine that should put given observable into errored state
 */
export function expectToBeErrored(observable: Observable<any>, routine?: () => void): void {
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


/**
 * Checks for given list to contain every expected element only once, without any other elements.
 *
 * @param list Value to expect for
 * @param expected List of values to found only once inside given list
 */
export function expectToContainExactly(list: any[], ...expected: any[]): void {
  expect(list).toHaveSize(expected.length); // Checks to not have any additional element

  for (const elem of expected) { // Checks for each expected element
    expect(list).toContain(elem);
  }
}
