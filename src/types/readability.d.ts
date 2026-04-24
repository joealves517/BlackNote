declare module "@mozilla/readability" {
  export interface ReadabilityOptions {
    debug?: boolean;
    maxElemsToParse?: number;
    nbTopCandidates?: number;
    charThreshold?: number;
    classesToPreserve?: string[];
    keepClasses?: boolean;
    serializer?: (el: Element) => string;
    disableJSONLD?: boolean;
    allowedVideoRegex?: RegExp;
  }

  export interface ReadabilityArticle {
    title: string;
    content: string;
    textContent: string;
    length: number;
    excerpt: string;
    byline: string | null;
    dir: string | null;
    siteName: string;
    lang: string | null;
    publishedTime: string | null;
  }

  export class Readability {
    constructor(document: Document, options?: ReadabilityOptions);
    parse(): ReadabilityArticle | null;
  }
}
