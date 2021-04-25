/**
 * Provides initialized Actor data.
 */
export class Actor {
  uid: number;
  name: string;

  constructor(uid: number, name: string) {
    this.uid = uid;
    this.name = name;
  }
}
