import {} from 'jasmine';
import { Observable } from 'rxjs'; // Required to use fail() declared by jasmine


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
