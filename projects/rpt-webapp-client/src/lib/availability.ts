/**
 * Provides data to check if server is full or not
 */
export class Availability {
  currentActors: number;
  actorsLimit: number;

  constructor(currentActors: number, actorsLimit: number) {
    this.currentActors = currentActors;
    this.actorsLimit = actorsLimit;
  }
}
