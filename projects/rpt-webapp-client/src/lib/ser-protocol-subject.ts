import { ObjectUnsubscribedError, Subject } from 'rxjs';

/**
 * Wrapper for `WebSocketSubject` pushing and formatting incoming and outgoing SER Protocol commands into RPTL messages.
 */
export class SerProtocolSubject extends Subject<string> {
  // Websocket connection to send and retrieve SER Protocol commands
  private messagingInterface: Subject<string>;

  /**
   * @param messagingInterface RPTL messages interface (Websocket connection) to be wrapped
   */
  constructor(messagingInterface: Subject<string>) {
    super();

    this.messagingInterface = messagingInterface;
  }

  /**
   * Sends given initialized SER command if subject is not completed/errored.
   *
   * @param serCommand SER command to push
   *
   * @throws ObjectUnsubscribedError if subject was unsubscribed
   * @throws Error if command is `undefined`
   */
  next(serCommand?: string): void {
    if (serCommand === undefined) { // Doesn't handle uninitialized serCommand
      throw new Error('Message must be initialized');
    }

    if (this.closed) { // Checks for subject to not have been unsubscribed
      throw new ObjectUnsubscribedError();
    }

    if (!this.isStopped) { // Checks for subject to not have been completed/errored
      this.messagingInterface.next(`SERVICE ${serCommand}`);
    }
  }

  /**
   * @param serCommand Command value which will be handled by next() observers method.
   */
  handleCommand(serCommand: string): void {
    super.next(serCommand);
  }
}
