/** A single PP#NN_V4 flow discovered on the /usa/ index page. */
export interface DiscoveredFlow {
  /** Zero-padded sequence, e.g. "01". */
  seq: string;
  /** Klaviyo-style template name, e.g. "PP#01_V4". */
  name: string;
  /** Subject / headline shown on the card (h4 text after the dash). */
  cardSubject: string;
  /** Absolute URL of the rendered email (screens/pp-NN.html). */
  screenUrl: string;
}

/** The fully extracted + processed record for one template (one Sheet row). */
export interface FlowRecord {
  seq: string;
  name: string;
  /** Klaviyo template URL if known (klaviyo-map.json), else the site link. */
  link: string;
  /** Klaviyo template ID if known (klaviyo-map.json), else "". */
  templateId: string;
  brand: string;
  /** Filename of the saved updated hero (or screenshot) asset. */
  imageAsset: string;
  /** "Packet replaced" | "No packet" | reason it was skipped. */
  imageNote: string;
  /** Subject line (from <title>, falling back to the card / first heading). */
  subject: string;
  /** Plain-text body copy. */
  bodyCopy: string;
  /** Plain-text footer block. */
  footer: string;
  /** Hero image source URL. */
  heroUrl: string;
  /** Full raw HTML of the rendered email. */
  fullHtml: string;
  /** Comma-separated list of every <img src> value. */
  imageLinks: string;
}

/** Result of extracting one screen's HTML (pre-image-processing). */
export interface ExtractResult {
  subject: string;
  bodyCopy: string;
  footer: string;
  heroUrl: string | null;
  imageSrcs: string[];
  fullHtml: string;
}

/** Per-run checkpoint, persisted so crashes/logouts resume cleanly. */
export interface RunState {
  startedAt: string;
  updatedAt: string;
  /** Records keyed by template name, accumulated as each flow completes. */
  records: Record<string, FlowRecord>;
  /** Template names that finished extraction + image processing. */
  done: string[];
}
