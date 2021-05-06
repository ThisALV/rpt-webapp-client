import { BadSerCommand } from './ser-protocol.service';


/**
 * Converts a Service Request Response status 'OK' or 'KO' into a boolean, useful for parsing scheme inside `CommandParser:parseTo()`.
 */
export class ServiceRequestResponse {
  private readonly succeed: boolean;

  /**
   * @param response Status, 'OK' if succeeded, 'KO' otherwise
   *
   * @throws BadSerCommand if status isn't 'OK` or 'KO'
   */
  constructor(response: string) {
    switch (response) {
      case 'OK':
        this.succeed = true;
        break;
      case 'KO':
        this.succeed = false;
        break;
      default:
        throw new BadSerCommand(`Unknown SRR status: ${response}`);
    }
  }

  /**
   * @returns `true` if status is succeed, `false` otherwise
   */
  isSucceed(): boolean {
    return this.succeed;
  }
}
