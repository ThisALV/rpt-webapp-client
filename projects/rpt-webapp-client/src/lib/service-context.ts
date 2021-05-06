/**
 * Provides UID for each new Service Request into the RPTL session, and keeps UID for SR commands waiting for a response.
 */
import { BadSerCommand } from './ser-protocol.service';

export class ServiceContext {
  // Service Request commands UID which are no longer available. Associated boolean notify if it was responded or if it is waiting for
  // an appropriate response
  private readonly awaitingRequests: { [requestUid: number]: boolean };

  // Count to provide an UID to each Service Request sent by client, so it can be confirmed by server in the right order
  private uidProvider: number;

  constructor() {
    this.awaitingRequests = {}; // All UID are available at construction
    this.uidProvider = 0;
  }

  /**
   * Gets an UID for the next SR command and marks that UID as awaiting for an appropriate SRR command.
   *
   * @returns An available UID for a next Service Request to send
   */
  generateServiceRequestUid(): number {
    const availableUid: number = this.uidProvider++; // Increments current UIDs count as current value become unavailable

    this.awaitingRequests[availableUid] = false; // This UID is now unavailable and waiting for a response

    return availableUid;
  }

  /**
   * Marks given UID as responded.
   *
   * @throws BadSerCommand if no SR was sent with that UID, or if it already is responded
   */
  done(requestUid: number): void {
    const currentRequestState: boolean | undefined = this.awaitingRequests[requestUid];

    if (currentRequestState === undefined) { // If there isn't any entry for that UID, it hasn't be used, SRR is ill-formed
      throw new BadSerCommand(`No SR commands used UID ${requestUid}`);
    } else if (currentRequestState) { // If there is an entry for that UID set to true, it has been responded, SRR is ill-formed
      throw new BadSerCommand(`SR command with UID ${requestUid} already received a response`);
    }

    this.awaitingRequests[requestUid] = true; // If a request is waiting for a response with that UID, it has been responded
  }
}
