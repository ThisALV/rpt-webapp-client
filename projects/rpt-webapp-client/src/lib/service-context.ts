/**
 * Provides UID for each new Service Request into the RPTL session.
 */
export class ServiceContext {
  // Count to provide an UID to each Service Request sent by client, so it can be confirmed by server in the right order
  private uidProvider: number;

  constructor() {
    this.uidProvider = 0;
  }

  /**
   * @returns An available UID for a next Service Request to send
   */
  generateServiceRequestUid(): number {
    return this.uidProvider++;
  }
}
