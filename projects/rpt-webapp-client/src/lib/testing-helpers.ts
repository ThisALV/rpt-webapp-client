import {} from 'jasmine'; // Required to use fail() declared by jasmine


export function unexpected(): void {
  fail('Unexpected Observable state');
}
