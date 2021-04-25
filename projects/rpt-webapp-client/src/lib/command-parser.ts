/**
 * `new` Constructable type which returns converted argument as converter-defined type
 */
export type ArgumentConverter = new(argument: string) => any;


/**
 * Instructions to convert a parsed command word. Parsed word has an argument name, and a converter which might be a `new` constructable
 * type taking raw argument as string and converting it to converter-defined type or format.
 */
export type ArgumentScheme = { name: string, type: ArgumentConverter };


/**
 * Thrown if an argument scheme is ill-formed during `CommandParser:parseTo()` call.
 */
export class BadArgumentScheme extends Error {
  /**
   * @param reason Why argument scheme is ill-formed
   */
  constructor(reason: string) {
    super(reason);
  }
}


/**
 * Parses given string using user-provided arguments scheme to parse and convert correct number of arguments. Each separated word is an
 * argument.
 */
export class CommandParser {
  parsedData: any;
  unparsed: string;

  /**
   * @param unparsed Words to be parsed
   * @param parsedData Already parsed and converted arguments from previous `parseTo()` calls
   */
  constructor(unparsed: string, parsedData: any = {}) {
    this.parsedData = parsedData;
    this.unparsed = unparsed;
  }

  /**
   * Parses unparsed words for this instance.
   *
   * @param schemes Schemes (name and converter) to parse each required argument
   *
   * @returns A new `CommandParser` containing newly plus previously parsed data and string which hasn't been parsed yet
   *
   * @throws BadArgumentScheme if at least schemes use the same argument name, or if there isn't enough words to complete all schemes
   *
   * @note Conversion errors are not handled by method and should be taken in consideration by the caller
   */
  parseTo(schemes: ArgumentScheme[]): CommandParser {
    const argumentsToParse: number = schemes.length;
    const parsedWordsQueue: string[] = this.unparsed.trim().split(' ', argumentsToParse);

    if (parsedWordsQueue.length < argumentsToParse) { // Checks to have enough arguments before beginning iteration
      throw new BadArgumentScheme(`Not enough arguments to parse: expected ${argumentsToParse}, got ${parsedWordsQueue.length}`);
    }

    // Calculates total parsed length to take correct substring as unparsed part
    const parsedLength: number = parsedWordsQueue.reduce(
      ((previousValue, currentValue) => previousValue + currentValue), ''
    ).length;

    const newParser: CommandParser = new CommandParser(this.parsedData, this.unparsed.substr(parsedLength));

    for (const argument of schemes) {
      if (newParser.parsedData[argument.name] !== undefined) { // Checks for argument name to be available
        throw new BadArgumentScheme(`Argument name ${argument.name} used at least twice`);
      }

      // pop() will return a value as we're sure that there are enough arguments to parse
      // We convert raw string argument using given type constructable with a string parameter
      newParser.parsedData[argument.name] = new argument.type(parsedWordsQueue.pop() as string);
    }

    // Retrieves new parsing step after current parsing
    return newParser;
  }
}
