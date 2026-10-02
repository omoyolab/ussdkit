/** One request from a gateway, normalised so the app never sees gateway specifics. */
export interface UssdRequest {
  /** Gateway session id. All requests for one dial share it. */
  sessionId: string;
  /** Subscriber phone number as the gateway sends it, e.g. `+2348012345678`. */
  phone: string;
  /** Dialled code, e.g. `*384*1234#`. */
  serviceCode: string;
  /** The user's latest input. Empty string on the first request of a session. */
  input: string;
  /**
   * Every input the user has sent so far, oldest first, when the gateway provides it.
   * Lets ussdkit rebuild a session that expired or was never stored.
   */
  inputs?: string[];
  /** Mobile network code, when the gateway sends it. */
  network?: string;
}

export interface UssdResponse {
  /** Text shown on the phone. */
  text: string;
  /** True ends the session after this screen. */
  end: boolean;
}

/** What a session remembers between screens when the app does not say otherwise. */
export type SessionData = Record<string, unknown>;

export interface Session {
  id: string;
  phone: string;
  serviceCode: string;
  /** Id of the screen the user is on. */
  screen: string;
  /** Screen ids visited before the current one, for back navigation. */
  history: string[];
  /** Anything handlers store with `goto` or by mutating `ctx.data`. */
  data: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
}

export interface SessionStore {
  get(id: string): Promise<Session | undefined>;
  set(session: Session, ttlSeconds: number): Promise<void>;
  delete(id: string): Promise<void>;
}

/** What a screen handler returns to say where the user goes next. */
export type Next<D extends object = SessionData> =
  | { goto: string; data?: Partial<D> }
  | { retry: string }
  | { end: string }
  | { back: true }
  | { home: true };

/** What `onStart` may return: end the session at once, or start somewhere other than home. */
export type Start<D extends object = SessionData> =
  { end: string } | { goto: string; data?: Partial<D> };

export interface Context<D extends object = SessionData> {
  /** Latest user input. Empty on the first render of a session. */
  input: string;
  phone: string;
  serviceCode: string;
  network: string | undefined;
  /** Id of the current screen. */
  screen: string;
  /** Shortcut to `session.data`. Mutations persist. Typed by `createApp<YourData>()`. */
  data: Partial<D>;
  session: Session;
  /**
   * True while ussdkit is rebuilding a lost session from the inputs the gateway resent.
   * The user typed this input in an earlier request and its handler has already run once.
   * Skip anything that must happen only once: counting a wrong PIN, sending an SMS, moving money.
   */
  replaying: boolean;
}

export type Renderer<D extends object = SessionData> =
  string | ((ctx: Context<D>) => string | Promise<string>);

export interface ScreenOptions {
  /** Set false to hand the back key to this screen as ordinary input. For prompts where `0` is a valid answer. */
  back?: boolean;
  /** Set false to hand the home key to this screen as ordinary input. */
  home?: boolean;
  /**
   * A step the user passes through once, like a PIN prompt. It is left out of the history,
   * so Back from the next screen skips it.
   */
  transient?: boolean;
}

export interface Screen<D extends object = SessionData> extends ScreenOptions {
  /** Text shown when the user lands on this screen. */
  render: Renderer<D>;
  /** Called with the user's input. Leave it out for an end screen. */
  handle?: (ctx: Context<D>) => Next<D> | Promise<Next<D>>;
}

export interface AppOptions<D extends object = SessionData> {
  /** Id of the first screen. Default `home`. */
  home?: string;
  /** Input that goes back one screen. Default `0`. Set `false` to disable. */
  backKey?: string | false;
  /** Input that returns to the home screen. Default `00`. Set `false` to disable. */
  homeKey?: string | false;
  /**
   * A line added to the bottom of every screen the back key works on, such as `0. Back`.
   * Leave it out to write the hint yourself.
   */
  backHint?: string;
  /**
   * Runs once when a session starts, before the first screen. Return `{ end }` to end the session
   * at once, for a number that is not registered or a service that is closed, or `{ goto }` to
   * start somewhere other than the home screen. Return nothing to start as usual.
   */
  onStart?: (ctx: Context<D>) => Start<D> | void | Promise<Start<D> | void>;
  /** Where sessions live. Default in-memory. */
  store?: SessionStore;
  /** Seconds of inactivity before a session is dropped. Default 180. */
  ttl?: number;
  /** Warn when a screen's text exceeds this many characters. Default 182. */
  maxLength?: number;
  /** Receives warnings such as over-long screens. Default `console.warn`. */
  onWarning?: (message: string) => void;
  /** Text prefixed to the screen when a menu gets an unknown option. Default `Invalid choice.` */
  invalidText?: string;
}

/** Translates between a gateway's wire format and ussdkit's request/response. */
export interface Gateway<Req = unknown, Res = unknown> {
  name: string;
  parse(request: Req): UssdRequest;
  format(response: UssdResponse): Res;
  /** Content type of the formatted response. */
  contentType: string;
}
