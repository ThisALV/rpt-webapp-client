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
    const parsedWords: string[] = [];

    let currentCharIndex = 0; // String to parse beginning
    let wordBegin = currentCharIndex; // Begin words parsing from string beginning
    let wordLength = 0; // No words currently parsed at initialization

    // Continue words parsing while expected number of arguments isn't reached and string isn't completely parsed
    while (currentCharIndex < this.unparsed.length && parsedWords.length < argumentsToParse) {
      const currentChar: string = this.unparsed[currentCharIndex];

      if (currentChar === ' ') { // If words separator is met
        if (wordLength !== 0) { // if word is currently into parsing stage, push that words into queue
          parsedWords.push(this.unparsed.substr(wordBegin, wordLength));
          wordLength = 0; // Ready to parse a new word
        }
      } else { // If words is currently being parsed
        if (wordLength === 0) { // If it is a new word...
          wordBegin = currentCharIndex; // ...then its position must be saved
        }

        wordLength++;
      }

      currentCharIndex++; // Char handled, go to next
    }

    if (wordLength !== 0) { // If a word was in parsing stage when parsing stopped, pushes it into queue
      parsedWords.push(this.unparsed.substr(wordBegin, wordLength));
    }

    const parsedWordsQueue: string[] = parsedWords.reverse(); // Enables FIFO order because neither push_back() nor pop_back() is available

    if (parsedWordsQueue.length < argumentsToParse) { // Checks to have enough arguments before beginning iteration
      throw new BadArgumentScheme(`Not enough arguments to parse: expected ${argumentsToParse}, got ${parsedWordsQueue.length}`);
    }

    // Flushes string until next non-separator char is met
    while (currentCharIndex < this.unparsed.length && this.unparsed[currentCharIndex] === ' ') {
      currentCharIndex++;
    }

    // Copies current parser to modify it during arguments parsing iteration
    const newParser: CommandParser = new CommandParser(this.unparsed.substr(currentCharIndex), this.parsedData);

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
