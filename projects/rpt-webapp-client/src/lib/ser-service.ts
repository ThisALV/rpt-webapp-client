import { Subject } from 'rxjs';
import { SerProtocolService } from './ser-protocol.service';


/**
 * Should be extended by Angular Services which are an implementation of a SER Service.
 */
export class SerService {
  /**
   * Provides subject to send Service Requests and receive Service Events.
   * @protected
   */
  protected readonly serviceSubject: Subject<string>;

  /**
   * Should be called inside children constructor to make Service registered inside SER Protocol and provides SER Service subject.
   *
   * @param underlyingProtocol SER Protocol to register Service inside
   * @param serviceName SER Service name which will be used for SR and SE commands
   */
  constructor(underlyingProtocol: SerProtocolService, serviceName: string) {
    this.serviceSubject = underlyingProtocol.register(serviceName);
  }
}
