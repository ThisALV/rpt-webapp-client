import { BadArgumentScheme, CommandParser } from './command-parser';


describe('CommandParser', () => {
  it('should throw if there is not enough args to parse', () => {
    const parser: CommandParser = new CommandParser('a b');

    expect(parser.parseTo([{ name: '1', type: String }, { name: '2', type: String }, { name: '3', type: String }]))
      .toThrow(BadArgumentScheme);
  });

  it('should throw if the same arg name appears at least two times', () => {
    const parser: CommandParser = new CommandParser('a b c d');

    expect(parser.parseTo([{ name: '1', type: String }, { name: '2', type: String }, { name: '1', type: String }]))
      .toThrow(BadArgumentScheme);
  });

  it('should parse as-it String-converter arguments', () => {
    const parser: CommandParser = new CommandParser('a b');

    const result: CommandParser = parser.parseTo([{ name: '1', type: String }, { name: '2', type: String }]);

    // Both arguments should have been parsed without any expected conversion
    expect(result).toEqual(new CommandParser('', { 1: 'a', 2: 'b' }));
  });

  it('should parse as-it String-converter arguments', () => {
    const parser: CommandParser = new CommandParser('a 42');

    const result: CommandParser = parser.parseTo([{ name: '1', type: String }, { name: '2', type: Number }]);

    // Both arguments should have been parsed with a numerical conversion for the second one
    expect(result).toEqual(new CommandParser('', { 1: 'a', 2: 42 }));
  });

  it('should ignore extra arguments', () => {
    const parser: CommandParser = new CommandParser('a b c d');

    const result: CommandParser = parser.parseTo([{ name: '1', type: String }, { name: '2', type: String }]);

    // Two first words should have been parsed, the two last remain unparsed
    expect(result).toEqual(new CommandParser(' c d', { 1: 'a', 2: 'b' }));
  });
});
