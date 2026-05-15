/**
 * Type definitions for the Document Picture-in-Picture API.
 * @see https://developer.chrome.com/docs/web-platform/document-picture-in-picture
 */

interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  readonly window: Window | null;
  onenter: ((this: DocumentPictureInPicture, ev: Event) => any) | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
